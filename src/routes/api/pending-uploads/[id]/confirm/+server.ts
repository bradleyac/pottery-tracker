import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { createPieceFromTemp, addImageToExistingPiece } from '$lib/server/pieces';

export const POST: RequestHandler = async ({ request, params, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const uploadId = params.id;
	const body = await request.json() as {
		action: 'accepted' | 'overridden' | 'new_piece';
		pieceId?: string;
		newPieceName?: string;
		notes?: string;
	};

	const supabase = createServiceRoleClient();

	// Fetch the pending_upload row
	const { data: upload, error: fetchError } = await supabase
		.from('pending_uploads')
		.select('*')
		.eq('id', uploadId)
		.eq('user_id', user.id)
		.single();

	if (fetchError || !upload) error(404, 'Pending upload not found');
	if (upload.status !== 'ready') error(400, 'Upload not ready for confirmation');

	let pieceId: string;

	try {
		if (body.action === 'new_piece') {
			if (!body.newPieceName?.trim()) error(400, 'newPieceName is required');
			const result = await createPieceFromTemp(
				user.id,
				upload.temp_storage_path,
				body.newPieceName!,
				body.notes ?? null,
				upload.updated_description
			);
			pieceId = result.pieceId;
		} else if (body.action === 'accepted') {
			if (!upload.matched_piece_id) error(400, 'No matched piece to accept');
			const result = await addImageToExistingPiece(
				user.id,
				upload.matched_piece_id!,
				upload.temp_storage_path,
				body.notes ?? null,
				upload.updated_description
			);
			pieceId = result.pieceId;
		} else if (body.action === 'overridden') {
			if (!body.pieceId) error(400, 'pieceId is required for overridden action');
			const result = await addImageToExistingPiece(
				user.id,
				body.pieceId!,
				upload.temp_storage_path,
				body.notes ?? null,
				upload.updated_description
			);
			pieceId = result.pieceId;
		} else {
			error(400, 'Invalid action');
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		error(500, err instanceof Error ? err.message : 'Failed to confirm upload');
	}

	// Insert audit row into piece_matches
	await supabase.from('piece_matches').insert({
		user_id: user.id,
		candidate_path: upload.temp_storage_path,
		suggested_piece_id: upload.matched_piece_id,
		confidence: upload.confidence,
		claude_reasoning: upload.claude_reasoning,
		user_action: body.action,
		final_piece_id: pieceId!
	});

	// Delete the pending_upload row
	await supabase.from('pending_uploads').delete().eq('id', uploadId);

	return json({ pieceId: pieceId! });
};
