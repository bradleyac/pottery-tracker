import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { matchImageToPieces } from '$lib/server/claude';
import type { ExistingPiece } from '$lib/server/claude';

export const POST: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const supabase = createServiceRoleClient();

	const { data: upload, error: fetchErr } = await supabase
		.from('pending_uploads')
		.select('*')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.single();

	if (fetchErr || !upload) error(404, 'Not found');

	// Skip if already processed
	if (upload.status === 'ready') return json({ ok: true, skipped: true });

	// Download image
	const { data: blob, error: dlErr } = await supabase.storage
		.from('pottery-images')
		.download(upload.temp_storage_path);

	if (dlErr || !blob) {
		await supabase.from('pending_uploads').update({ status: 'failed' }).eq('id', params.id);
		error(500, 'Failed to download image');
	}

	const buffer = Buffer.from(await blob.arrayBuffer());

	// Fetch user's pieces
	const { data: pieces } = await supabase
		.from('pieces')
		.select('id, name, ai_description')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false });

	const existingPieces: ExistingPiece[] = (pieces ?? []).map((p) => ({
		id: p.id,
		name: p.name,
		ai_description: p.ai_description
	}));

	try {
		const result = await matchImageToPieces(buffer, 'image/jpeg', existingPieces);

		await supabase
			.from('pending_uploads')
			.update({
				status: 'ready',
				matched_piece_id: result.matchedPieceId,
				confidence: result.confidence,
				claude_reasoning: result.reasoning,
				suggested_name: result.suggestedName,
				updated_description: result.updatedDescription
			})
			.eq('id', params.id);

		return json({ ok: true });
	} catch {
		await supabase.from('pending_uploads').update({ status: 'failed' }).eq('id', params.id);
		error(500, 'Analysis failed');
	}
};
