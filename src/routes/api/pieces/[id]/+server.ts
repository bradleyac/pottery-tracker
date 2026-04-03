import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { deleteImage, buildThumbnailPath } from '$lib/server/storage';

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const pieceId = params.id;
	const supabase = createServiceRoleClient();

	// Verify ownership
	const { data: piece, error: pieceError } = await supabase
		.from('pieces')
		.select('id')
		.eq('id', pieceId)
		.eq('user_id', user.id)
		.single();

	if (pieceError || !piece) error(404, 'Piece not found');

	// Fetch all image storage paths
	const { data: images } = await supabase
		.from('images')
		.select('id, storage_path')
		.eq('piece_id', pieceId);

	// Delete storage files (main image + derived thumbnail and depth map)
	for (const img of images ?? []) {
		const paths = [img.storage_path, buildThumbnailPath(user.id, pieceId, img.id)];
		for (const path of paths) {
			try {
				await deleteImage(path);
			} catch {
				// Non-fatal — file may not exist (e.g. no depth map generated)
			}
		}
	}

	// Delete image records
	await supabase.from('images').delete().eq('piece_id', pieceId);

	// Delete the piece
	const { error: deleteError } = await supabase.from('pieces').delete().eq('id', pieceId);

	if (deleteError) error(500, `Failed to delete piece: ${deleteError.message}`);

	return json({ ok: true });
};
