import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { uploadImage, getSignedUrls, buildGlazeInspirationPath } from '$lib/server/storage';
import type { GlazeInspirationWithUrl } from '$lib/types';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const supabase = createServiceRoleClient();
	const { data, error: dbError } = await supabase
		.from('glaze_inspirations')
		.select('id, user_id, name, storage_path, created_at')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false });

	if (dbError) error(500, `Failed to load glaze inspirations: ${dbError.message}`);

	const rows = data ?? [];
	const paths = rows.map((r) => r.storage_path);
	const signedUrls = await getSignedUrls(paths);

	const result: GlazeInspirationWithUrl[] = rows.map((r) => ({
		...r,
		url: signedUrls.get(r.storage_path) ?? ''
	}));

	return json(result);
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const formData = await request.formData();
	const file = formData.get('image');
	const name = formData.get('name');

	if (!(file instanceof File)) error(400, 'image is required');
	if (!file.type.startsWith('image/')) error(400, 'File must be an image');
	if (file.size > 10 * 1024 * 1024) error(400, 'Image must be under 10 MB');

	const rawBuffer = Buffer.from(await file.arrayBuffer());

	// Normalise to JPEG and auto-orient
	const buffer = await sharp(rawBuffer).rotate().jpeg({ quality: 90 }).toBuffer();

	const imageId = randomUUID();
	const storagePath = buildGlazeInspirationPath(user.id, imageId);

	await uploadImage(buffer, storagePath, 'image/jpeg');

	const supabase = createServiceRoleClient();
	const { data: row, error: dbError } = await supabase
		.from('glaze_inspirations')
		.insert({
			id: imageId,
			user_id: user.id,
			name: typeof name === 'string' ? name.trim() : '',
			storage_path: storagePath
		})
		.select('id, user_id, name, storage_path, created_at')
		.single();

	if (dbError || !row) error(500, `Failed to save glaze inspiration: ${dbError?.message}`);

	const signedUrls = await getSignedUrls([storagePath]);
	const result: GlazeInspirationWithUrl = {
		...row,
		url: signedUrls.get(storagePath) ?? ''
	};

	return json(result, { status: 201 });
};
