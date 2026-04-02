import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { matchImageToPieces, describeNewPiece, generateImageEmbedding } from '$lib/server/claude';
import { getCandidatesByEmbedding } from '$lib/server/pieces';
import { getMatchingStrategy } from '$lib/server/strategies';

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

	try {
		const strategy = await getMatchingStrategy();
		const [embedding, description] = await Promise.all([
			generateImageEmbedding(buffer),
			describeNewPiece(buffer, 'image/jpeg')
		]);

		const candidates = await getCandidatesByEmbedding(user.id, embedding);

		let result;
		if (candidates.length === 0) {
			result = {
				matchedPieceId: null,
				confidence: 0,
				reasoning: 'No candidate pieces with embeddings to match against.',
				suggestedName: 'New Piece',
				updatedDescription: description
			};
		} else {
			result = await matchImageToPieces(buffer, 'image/jpeg', candidates, strategy);
			if (!result.updatedDescription) {
				result.updatedDescription = description;
			}
		}

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
