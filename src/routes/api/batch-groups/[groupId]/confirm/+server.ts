import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { createPieceFromTemp, addImageToExistingPiece } from '$lib/server/pieces';

export const POST: RequestHandler = async ({ request, params, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const groupId = params.groupId;
	const body = (await request.json()) as {
		action: 'to_piece' | 'new_piece';
		pieceId?: string;
		newPieceName?: string;
	};

	const supabase = createServiceRoleClient();

	// Fetch all ready uploads in this group owned by the user
	const { data: uploads, error: fetchError } = await supabase
		.from('pending_uploads')
		.select('*')
		.eq('batch_group_id', groupId)
		.eq('user_id', user.id)
		.eq('status', 'ready')
		.order('created_at', { ascending: true });

	if (fetchError || !uploads || uploads.length === 0) error(404, 'Group not found');

	let pieceId: string;

	try {
		if (body.action === 'new_piece') {
			if (!body.newPieceName?.trim()) error(400, 'newPieceName is required');

			// First upload creates the piece (becomes the cover)
			const [first, ...rest] = uploads;
			const result = await createPieceFromTemp(
				user.id,
				first.temp_storage_path,
				body.newPieceName!,
				null,
				first.updated_description
			);
			pieceId = result.pieceId;

			// Remaining uploads added sequentially (addImageToExistingPiece is safe to parallelize
			// after the cover is set, but sequential keeps ordering predictable)
			for (const upload of rest) {
				await addImageToExistingPiece(user.id, pieceId, upload.temp_storage_path, null, null);
			}
		} else if (body.action === 'to_piece') {
			if (!body.pieceId) error(400, 'pieceId is required');
			pieceId = body.pieceId!;

			for (const upload of uploads) {
				await addImageToExistingPiece(user.id, pieceId, upload.temp_storage_path, null, null);
			}
		} else {
			error(400, 'Invalid action');
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		error(500, err instanceof Error ? err.message : 'Failed to confirm group');
	}

	// Audit rows for each upload
	await supabase.from('piece_matches').insert(
		uploads.map((u) => ({
			user_id: user.id,
			candidate_path: u.temp_storage_path,
			suggested_piece_id: u.matched_piece_id,
			confidence: u.confidence,
			claude_reasoning: u.claude_reasoning,
			user_action: (
				body.action === 'new_piece'
					? 'new_piece'
					: u.matched_piece_id === pieceId!
						? 'accepted'
						: 'overridden'
			) as 'accepted' | 'overridden' | 'new_piece',
			final_piece_id: pieceId!
		}))
	);

	// Delete all pending_upload rows in the group
	await supabase.from('pending_uploads').delete().eq('batch_group_id', groupId).eq('user_id', user.id);

	return json({ pieceId: pieceId! });
};
