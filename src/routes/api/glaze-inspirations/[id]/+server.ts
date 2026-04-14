import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { deleteImage, deleteCachedUrls } from '$lib/server/storage';

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const supabase = createServiceRoleClient();
	const { data: row, error: fetchError } = await supabase
		.from('glaze_inspirations')
		.select('id, storage_path')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.single();

	if (fetchError || !row) error(404, 'Glaze inspiration not found');

	await deleteImage(row.storage_path).catch(() => {});
	await deleteCachedUrls([row.storage_path]).catch(() => {});

	const { error: deleteError } = await supabase
		.from('glaze_inspirations')
		.delete()
		.eq('id', params.id);

	if (deleteError) error(500, `Failed to delete: ${deleteError.message}`);

	return json({ ok: true });
};
