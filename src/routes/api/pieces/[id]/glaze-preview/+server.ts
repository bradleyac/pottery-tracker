import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { downloadImage } from '$lib/server/storage';
import { generateGlazedImage } from '$lib/server/replicate';

export const POST: RequestHandler = async ({ request, params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const body = await request.json().catch(() => null);
	const { pieceImageId, glazeInspirationId } = body ?? {};

	if (typeof pieceImageId !== 'string' || typeof glazeInspirationId !== 'string') {
		error(400, 'pieceImageId and glazeInspirationId are required');
	}

	const supabase = createServiceRoleClient();

	// Verify piece image ownership and belongs to this piece
	const { data: image, error: imgError } = await supabase
		.from('images')
		.select('storage_path')
		.eq('id', pieceImageId)
		.eq('piece_id', params.id)
		.eq('user_id', user.id)
		.single();

	if (imgError || !image) error(404, 'Piece image not found');

	// Verify glaze inspiration ownership
	const { data: inspiration, error: inspError } = await supabase
		.from('glaze_inspirations')
		.select('storage_path')
		.eq('id', glazeInspirationId)
		.eq('user_id', user.id)
		.single();

	if (inspError || !inspiration) error(404, 'Glaze inspiration not found');

	const [pieceBuffer, glazeBuffer] = await Promise.all([
		downloadImage(image.storage_path),
		downloadImage(inspiration.storage_path)
	]);

	const imageUrl = await generateGlazedImage(pieceBuffer, glazeBuffer);

	return json({ imageUrl });
};
