import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { deleteImage } from '$lib/server/storage';

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const uploadId = params.id;
	const supabase = createServiceRoleClient();

	const { data: upload, error: fetchError } = await supabase
		.from('pending_uploads')
		.select('id, user_id, temp_storage_path')
		.eq('id', uploadId)
		.eq('user_id', user.id)
		.single();

	if (fetchError || !upload) error(404, 'Pending upload not found');

	// Delete temp storage file (non-fatal)
	try {
		await deleteImage(upload.temp_storage_path);
	} catch {
		// ignore
	}

	await supabase.from('pending_uploads').delete().eq('id', uploadId);

	return json({ ok: true });
};
