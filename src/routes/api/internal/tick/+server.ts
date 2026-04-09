import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createServiceRoleClient } from '$lib/server/supabase';
import { consolidateBatch } from '$lib/server/batch';
import {
	IN_PROGRESS_STATUSES,
	MAX_ANALYZE_ATTEMPTS,
	MAX_BATCH_ATTEMPTS,
	nextBackoff
} from '$lib/server/statuses';
import type { PendingUploadStatus } from '$lib/types';

const TICK_LIMIT = 25;
const ANALYZE_LEASE_MINUTES = 5;
const CONSOLIDATE_LEASE_MINUTES = 5;
const BATCH_DEADLINE_MINUTES = 10;

export const POST: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('Authorization');
	if (authHeader !== `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`) error(401, 'Unauthorized');

	// Accept an empty body (from pg_cron) or optional JSON
	try {
		await request.json();
	} catch {
		/* empty body is fine */
	}

	const supabase = createServiceRoleClient();
	const edgeFunctionUrl = `${PUBLIC_SUPABASE_URL}/functions/v1/analyze-pending`;
	const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

	// ─── Sweep A: release expired analyze leases ─────────────────────────────
	await supabase
		.from('pending_uploads')
		.update({ analyze_locked_at: null })
		.lt('analyze_locked_at', new Date(Date.now() - ANALYZE_LEASE_MINUTES * 60_000).toISOString())
		.not('analyze_locked_at', 'is', null);

	// ─── Sweep B: re-trigger eligible analyze rows ────────────────────────────
	const eligibleStatuses: PendingUploadStatus[] = ['queued', 'preprocessing', 'analyzing'];
	const now = new Date().toISOString();

	const { data: eligibleRows } = await supabase
		.from('pending_uploads')
		.select('id')
		.in('status', eligibleStatuses)
		.or(`analyze_next_attempt_at.is.null,analyze_next_attempt_at.lte.${now}`)
		.is('analyze_locked_at', null)
		.lt('analyze_attempts', MAX_ANALYZE_ATTEMPTS)
		.limit(TICK_LIMIT);

	if (eligibleRows && eligibleRows.length > 0) {
		for (const row of eligibleRows) {
			// Atomically claim the row — only the winner proceeds
			const { data: claimed } = await supabase
				.from('pending_uploads')
				.update({ analyze_locked_at: new Date().toISOString() })
				.eq('id', row.id)
				.is('analyze_locked_at', null)
				.select('id')
				.maybeSingle();

			if (!claimed) continue; // lost the race

			// Fire the edge function without awaiting — it will clear the lease on completion
			fetch(edgeFunctionUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${serviceKey}`
				},
				body: JSON.stringify({ uploadId: row.id })
			}).catch((err: unknown) =>
				console.error(`[tick] analyze-pending trigger failed for ${row.id}:`, err)
			);
		}
	}

	// ─── Sweep C: release expired consolidate leases & advance batches ────────
	await supabase
		.from('pending_batches')
		.update({ consolidate_locked_at: null })
		.lt(
			'consolidate_locked_at',
			new Date(Date.now() - CONSOLIDATE_LEASE_MINUTES * 60_000).toISOString()
		)
		.not('consolidate_locked_at', 'is', null)
		.is('consolidated_at', null);

	const { data: batchRows } = await supabase
		.from('pending_batches')
		.select('batch_id, created_at, consolidate_attempts')
		.is('consolidated_at', null)
		.or(`consolidate_next_attempt_at.is.null,consolidate_next_attempt_at.lte.${now}`)
		.is('consolidate_locked_at', null)
		.limit(TICK_LIMIT);

	if (batchRows && batchRows.length > 0) {
		for (const batch of batchRows) {
			const batchId = batch.batch_id;
			const batchAge = Date.now() - new Date(batch.created_at).getTime();
			const batchDeadline = BATCH_DEADLINE_MINUTES * 60_000;

			// Check if any member is still in early analysis (hasn't settled yet)
			const { data: members } = await supabase
				.from('pending_uploads')
				.select('id, status, created_at')
				.eq('batch_id', batchId);

			if (!members) continue;

			const stillAnalyzing = members.some((m) =>
				['queued', 'preprocessing', 'analyzing'].includes(m.status)
			);

			if (stillAnalyzing && batchAge < batchDeadline) {
				// Wait — analysis still in flight and not past the deadline
				continue;
			}

			// Past deadline: force-fail stuck early-stage members so consolidation can proceed
			if (batchAge >= batchDeadline) {
				const stuckIds = members
					.filter((m) => ['queued', 'preprocessing', 'analyzing'].includes(m.status))
					.map((m) => m.id);
				if (stuckIds.length > 0) {
					await supabase
						.from('pending_uploads')
						.update({ status: 'failed', analyze_locked_at: null })
						.in('id', stuckIds);
				}
			}

			// Skip if no members are in a consolidatable state
			const consolidatable = members.some((m) =>
				['waiting_for_batch', 'consolidating', 'ready'].includes(m.status)
			);
			if (!consolidatable) {
				// All members failed — mark batch done
				await supabase
					.from('pending_batches')
					.update({ consolidated_at: new Date().toISOString() })
					.eq('batch_id', batchId);
				continue;
			}

			// Atomically claim the batch
			const { data: claimedBatch } = await supabase
				.from('pending_batches')
				.update({ consolidate_locked_at: new Date().toISOString() })
				.eq('batch_id', batchId)
				.is('consolidate_locked_at', null)
				.is('consolidated_at', null)
				.select('batch_id')
				.maybeSingle();

			if (!claimedBatch) continue; // lost the race

			// First move waiting_for_batch → consolidating
			await supabase
				.from('pending_uploads')
				.update({ status: 'consolidating' })
				.eq('batch_id', batchId)
				.eq('status', 'waiting_for_batch');

			try {
				await consolidateBatch(batchId);

				await supabase
					.from('pending_batches')
					.update({
						consolidated_at: new Date().toISOString(),
						consolidate_locked_at: null,
						consolidate_last_error: null
					})
					.eq('batch_id', batchId);
			} catch (err) {
				const attempts = (batch.consolidate_attempts ?? 0) + 1;
				const backoffSec = nextBackoff(attempts);
				const nextAttempt = new Date(Date.now() + backoffSec * 1000).toISOString();
				const errMsg = err instanceof Error ? err.message : String(err);

				if (attempts >= MAX_BATCH_ATTEMPTS) {
					// Give up — mark members failed, stamp consolidated_at so the batch stops blocking
					await supabase
						.from('pending_uploads')
						.update({ status: 'failed' })
						.eq('batch_id', batchId)
						.in('status', ['consolidating', 'waiting_for_batch']);

					await supabase
						.from('pending_batches')
						.update({
							consolidated_at: new Date().toISOString(),
							consolidate_locked_at: null,
							consolidate_last_error: errMsg,
							consolidate_attempts: attempts
						})
						.eq('batch_id', batchId);
				} else {
					await supabase
						.from('pending_batches')
						.update({
							consolidate_attempts: attempts,
							consolidate_next_attempt_at: nextAttempt,
							consolidate_locked_at: null,
							consolidate_last_error: errMsg
						})
						.eq('batch_id', batchId);
				}

				console.error(`[tick] consolidateBatch failed for ${batchId} (attempt ${attempts}):`, err);
			}
		}
	}

	// Nudge: also force-fail stuck in-progress rows older than the deadline
	// (belt-and-suspenders for statuses that aren't 'queued'/'preprocessing'/'analyzing')
	const stuckDeadline = new Date(Date.now() - BATCH_DEADLINE_MINUTES * 60_000).toISOString();
	await supabase
		.from('pending_uploads')
		.update({ status: 'failed', analyze_locked_at: null })
		.in('status', IN_PROGRESS_STATUSES)
		.lt('analyze_attempts', MAX_ANALYZE_ATTEMPTS) // only if not already retried to max
		.lt('created_at', stuckDeadline)
		.not('batch_id', 'is', null); // only batch members — solo uploads have their own retry

	return json({ ok: true });
};
