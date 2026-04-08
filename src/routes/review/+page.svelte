<script lang="ts">
	import type { PageData } from './$types';
	import { invalidate } from '$app/navigation';
	import PendingUploadCard from '$lib/components/PendingUploadCard.svelte';
	import BatchGroupCard from '$lib/components/BatchGroupCard.svelte';
	import BatchProgressCard from '$lib/components/BatchProgressCard.svelte';
	import type { CardDecision } from '$lib/components/PendingUploadCard.svelte';
	import type { GroupDecision } from '$lib/components/BatchGroupCard.svelte';
	import type { PendingUploadWithUrls, PendingBatch, PendingUploadStatus } from '$lib/types';

	const IN_PROGRESS_STATUSES: PendingUploadStatus[] = [
		'queued',
		'preprocessing',
		'analyzing',
		'waiting_for_batch',
		'consolidating'
	];

	let { data } = $props<{ data: PageData }>();

	// Local decisions per upload id (individual) or group id (batch groups)
	let decisions = $state<Map<string, CardDecision>>(new Map());
	let groupDecisions = $state<Map<string, GroupDecision>>(new Map());

	const uploads = $derived(data.pendingUploads);
	const hasQueued = $derived(
		data.pendingBatches.length > 0 ||
			uploads.some((u: PendingUploadWithUrls) =>
				IN_PROGRESS_STATUSES.includes(u.status as PendingUploadStatus)
			)
	);

	let retriedIds = $state(new Set<string>());

	// Auto-poll every 5s while items are queued; also fire retries for stuck uploads
	$effect(() => {
		if (!hasQueued) return;
		const timer = setInterval(async () => {
			for (const upload of uploads) {
				if (upload.isStuck && !retriedIds.has(upload.id)) {
					retriedIds = new Set([...retriedIds, upload.id]);
					fetch(`/api/pending-uploads/${upload.id}/retry`, { method: 'POST' }).catch(() => {});
				}
			}
			await invalidate('app:review');
		}, 5000);
		return () => clearInterval(timer);
	});

	// Split uploads into groups, individuals, and in-flight batch cards.
	// A group needs 2+ ready members sharing a batch_group_id.
	type ReviewItem =
		| { kind: 'group'; groupId: string; members: PendingUploadWithUrls[] }
		| { kind: 'individual'; upload: PendingUploadWithUrls }
		| { kind: 'pending_batch'; batch: PendingBatch };

	const reviewItems = $derived.by<ReviewItem[]>(() => {
		const dismissed = new Set(
			[...decisions.entries()]
				.filter(([, d]) => d.mode === 'dismissed')
				.map(([id]) => id)
		);
		const savedGroups = new Set(
			[...groupDecisions.entries()]
				.filter(([, d]) => d.mode === 'saved')
				.map(([id]) => id)
		);

		const items: ReviewItem[] = [];

		// Pending batch progress cards come first
		for (const batch of data.pendingBatches) {
			items.push({ kind: 'pending_batch', batch });
		}

		// Gather group members (ready, not individually dismissed)
		const groupMap = new Map<string, PendingUploadWithUrls[]>();
		for (const u of uploads) {
			if (u.batch_group_id && u.status === 'ready' && !dismissed.has(u.id)) {
				if (!groupMap.has(u.batch_group_id)) groupMap.set(u.batch_group_id, []);
				groupMap.get(u.batch_group_id)!.push(u);
			}
		}

		const groupedUploadIds = new Set<string>();

		for (const [groupId, members] of groupMap) {
			if (members.length < 2 || savedGroups.has(groupId)) continue;
			for (const m of members) groupedUploadIds.add(m.id);
			items.push({ kind: 'group', groupId, members });
		}

		// Remaining uploads rendered individually
		for (const u of uploads) {
			if (groupedUploadIds.has(u.id)) continue;
			if (dismissed.has(u.id)) continue;
			items.push({ kind: 'individual', upload: u });
		}

		return items;
	});

	function getDecision(id: string): CardDecision {
		return decisions.get(id) ?? { mode: 'review' };
	}

	function setDecision(id: string, d: CardDecision) {
		const next = new Map(decisions);
		next.set(id, d);
		decisions = next;
	}

	function getGroupDecision(groupId: string): GroupDecision {
		return groupDecisions.get(groupId) ?? { mode: 'review' };
	}

	function setGroupDecision(groupId: string, d: GroupDecision) {
		const next = new Map(groupDecisions);
		next.set(groupId, d);
		groupDecisions = next;
	}

	async function handleConfirm(
		upload: PendingUploadWithUrls,
		action: 'accepted' | 'overridden' | 'new_piece',
		notes: string,
		pieceId?: string,
		newPieceName?: string
	) {
		try {
			const resp = await fetch(`/api/pending-uploads/${upload.id}/confirm`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, pieceId, newPieceName, notes })
			});
			if (!resp.ok) {
				const txt = await resp.text().catch(() => '');
				setDecision(upload.id, { mode: 'error', message: txt || 'Failed to save' });
				return;
			}
			const { pieceId: savedPieceId } = await resp.json();
			setDecision(upload.id, { mode: 'saved', pieceId: savedPieceId });
			await invalidate('app:review');
		} catch {
			setDecision(upload.id, { mode: 'error', message: 'Network error. Please try again.' });
		}
	}

	async function handleGroupConfirm(
		groupId: string,
		action: 'to_piece' | 'new_piece',
		pieceId?: string,
		newPieceName?: string
	) {
		try {
			const resp = await fetch(`/api/batch-groups/${groupId}/confirm`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, pieceId, newPieceName })
			});
			if (!resp.ok) {
				const txt = await resp.text().catch(() => '');
				setGroupDecision(groupId, { mode: 'error', message: txt || 'Failed to save' });
				return;
			}
			const { pieceId: savedPieceId } = await resp.json();
			setGroupDecision(groupId, { mode: 'saved', pieceId: savedPieceId });
			await invalidate('app:review');
		} catch {
			setGroupDecision(groupId, { mode: 'error', message: 'Network error. Please try again.' });
		}
	}

	async function handleSeparate(uploadId: string) {
		await fetch(`/api/pending-uploads/${uploadId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ separateFromGroup: true })
		});
		await invalidate('app:review');
	}

	async function handleRetry(upload: PendingUploadWithUrls) {
		retriedIds = new Set([...retriedIds, upload.id]);
		await fetch(`/api/pending-uploads/${upload.id}/retry`, { method: 'POST' }).catch(() => {});
		await invalidate('app:review');
	}

	async function handleDismiss(upload: PendingUploadWithUrls) {
		try {
			await fetch(`/api/pending-uploads/${upload.id}`, { method: 'DELETE' });
			setDecision(upload.id, { mode: 'dismissed' });
			await invalidate('app:review');
		} catch {
			// Ignore dismiss errors
		}
	}

	const pendingCount = $derived(
		reviewItems.filter((item) => {
			if (item.kind === 'pending_batch') return false;
			if (item.kind === 'group') return getGroupDecision(item.groupId).mode === 'review';
			const d = getDecision(item.upload.id);
			return d.mode === 'review' && item.upload.status === 'ready';
		}).length
	);
</script>

<svelte:head>
	<title>Review Photos — Pottery Tracker</title>
</svelte:head>

<div class="review-page">
	<div class="page-header">
		<div class="header-left">
			<h1>Review Photos</h1>
			{#if pendingCount > 0}
				<span class="count-badge">{pendingCount} awaiting review</span>
			{/if}
		</div>
		<a href="/upload" class="btn-upload">+ Upload more</a>
	</div>

	{#if reviewItems.length === 0}
		<div class="empty-state">
			<span class="empty-icon">✓</span>
			<h2>All caught up!</h2>
			<p>No photos waiting for review.</p>
			<div class="empty-actions">
				<a href="/upload" class="btn-primary">Upload a photo</a>
				<a href="/" class="btn-secondary">Back to dashboard</a>
			</div>
		</div>
	{:else}
		<div class="cards-list">
			{#each reviewItems as item (item.kind === 'group' ? item.groupId : item.kind === 'pending_batch' ? item.batch.batchId : item.upload.id)}
				{#if item.kind === 'pending_batch'}
					<BatchProgressCard batch={item.batch} />
				{:else if item.kind === 'group'}
					<BatchGroupCard
						uploads={item.members}
						pieces={data.pieces}
						decision={getGroupDecision(item.groupId)}
						onDecisionChange={(d) => setGroupDecision(item.groupId, d)}
						onConfirm={(action, pid, name) => handleGroupConfirm(item.groupId, action, pid, name)}
						onSeparate={handleSeparate}
					/>
				{:else}
					<PendingUploadCard
						upload={item.upload}
						pieces={data.pieces}
						decision={getDecision(item.upload.id)}
						onDecisionChange={(d) => setDecision(item.upload.id, d)}
						onConfirm={(action, notes, pid, name) =>
							handleConfirm(item.upload, action, notes, pid, name)}
						onDismiss={() => handleDismiss(item.upload)}
						onRetry={() => handleRetry(item.upload)}
					/>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.review-page {
		max-width: 760px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
		gap: 1rem;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.page-header h1 {
		font-size: 1.75rem;
		font-weight: 700;
		color: #2c1810;
	}

	.count-badge {
		background: #fef3c7;
		border: 1px solid #fcd34d;
		color: #92400e;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 20px;
		padding: 0.2rem 0.625rem;
	}

	.btn-upload {
		padding: 0.5rem 1rem;
		background: #c0622c;
		color: white;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
		transition: background 0.15s;
	}

	.btn-upload:hover { background: #a8521f; }

	.cards-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.empty-state {
		background: white;
		border-radius: 16px;
		padding: 3rem 2rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		border: 1px solid #ede8e0;
	}

	.empty-icon {
		width: 56px;
		height: 56px;
		background: #f0fdf4;
		border: 2px solid #86efac;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		color: #166534;
	}

	.empty-state h2 {
		font-size: 1.375rem;
		color: #2c1810;
	}

	.empty-state p {
		color: #7a5c4e;
	}

	.empty-actions {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		width: 100%;
		max-width: 240px;
	}

	.btn-primary {
		display: block;
		padding: 0.75rem;
		background: #c0622c;
		color: white;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 600;
		text-align: center;
		transition: background 0.15s;
	}

	.btn-primary:hover { background: #a8521f; }

	.btn-secondary {
		display: block;
		padding: 0.75rem;
		background: white;
		color: #4a3728;
		border: 1.5px solid #d4c4b8;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 500;
		text-align: center;
		transition: all 0.15s;
	}

	.btn-secondary:hover {
		border-color: #c0622c;
		color: #c0622c;
	}
</style>
