import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { uploadImage, buildGlazePreviewPath } from '$lib/server/storage';

export const POST: RequestHandler = async ({ request, params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const body = await request.json().catch(() => null);
	const { imageUrl, pieceImageId, glazeInspirationId } = body ?? {};

	if (typeof imageUrl !== 'string') error(400, 'imageUrl is required');

	const supabase = createServiceRoleClient();

	// Verify piece belongs to user
	const { data: piece, error: pieceError } = await supabase
		.from('pieces')
		.select('id')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.single();

	if (pieceError || !piece) error(404, 'Piece not found');

	// Download from Replicate
	const fetchResp = await fetch(imageUrl);
	if (!fetchResp.ok) error(502, 'Failed to fetch preview image');
	const buffer = Buffer.from(await fetchResp.arrayBuffer());

	// Generate ID and upload to storage
	const previewId = crypto.randomUUID();
	const storagePath = buildGlazePreviewPath(user.id, previewId);
	await uploadImage(buffer, storagePath, 'image/jpeg');

	// Create DB row
	const { data: preview, error: insertError } = await supabase
		.from('glaze_previews')
		.insert({
			id: previewId,
			piece_id: params.id,
			user_id: user.id,
			storage_path: storagePath,
			piece_image_id: typeof pieceImageId === 'string' ? pieceImageId : null,
			glaze_inspiration_id: typeof glazeInspirationId === 'string' ? glazeInspirationId : null
		})
		.select('id')
		.single();

	if (insertError || !preview) error(500, 'Failed to save glaze preview');

	return json({ id: preview.id });
};
