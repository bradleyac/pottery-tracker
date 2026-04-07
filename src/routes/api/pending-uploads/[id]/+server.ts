import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { deleteImage, deleteCachedUrls } from '$lib/server/storage';
import { randomUUID } from 'crypto';

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
	await deleteCachedUrls([upload.temp_storage_path]).catch(() => {});

	await supabase.from('pending_uploads').delete().eq('id', uploadId);

	return json({ ok: true });
};

// Separate an upload from its batch group by assigning it a new unique batch_group_id.
// The upload remains in the review queue as an individual item.
export const PATCH: RequestHandler = async ({ request, params, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const body = (await request.json()) as { separateFromGroup?: boolean };
	if (!body.separateFromGroup) error(400, 'Nothing to update');

	const supabase = createServiceRoleClient();

	const { error: updateError } = await supabase
		.from('pending_uploads')
		.update({ batch_group_id: randomUUID() })
		.eq('id', params.id)
		.eq('user_id', user.id);

	if (updateError) error(500, updateError.message);

	return json({ ok: true });
};
