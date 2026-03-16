import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { deleteImage } from '$lib/server/storage';

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const supabase = createServiceRoleClient();

	// Fetch image and verify ownership
	const { data: image, error: fetchError } = await supabase
		.from('images')
		.select('id, piece_id, user_id, storage_path, is_cover')
		.eq('id', params.imageId)
		.eq('user_id', user.id)
		.single();

	if (fetchError || !image) error(404, 'Image not found');

	// Delete from storage
	try {
		await deleteImage(image.storage_path);
	} catch {
		// Non-fatal — continue to remove DB record
	}

	// Delete DB row
	const { error: deleteError } = await supabase
		.from('images')
		.delete()
		.eq('id', params.imageId);

	if (deleteError) error(500, `Failed to delete image: ${deleteError.message}`);

	// If this was the cover image, assign the next available image as cover (or clear it)
	if (image.is_cover) {
		const { data: nextImage } = await supabase
			.from('images')
			.select('id')
			.eq('piece_id', image.piece_id)
			.order('uploaded_at', { ascending: true })
			.limit(1)
			.single();

		await supabase
			.from('pieces')
			.update({ cover_image_id: nextImage?.id ?? null })
			.eq('id', image.piece_id);

		if (nextImage) {
			await supabase
				.from('images')
				.update({ is_cover: true })
				.eq('id', nextImage.id);
		}
	}

	return json({ ok: true });
};
