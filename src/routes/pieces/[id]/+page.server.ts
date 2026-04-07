import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getSignedUrls } from '$lib/server/storage';
import type { ImageWithUrl, PieceWithImages } from '$lib/types';
import { createServiceRoleClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const supabase = createServiceRoleClient();

	const { data: piece, error: pieceError } = await supabase
		.from('pieces')
		.select('id, name, description, ai_description, created_at, updated_at, cover_image_id, cover_embedding')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.single();

	if (pieceError || !piece) error(404, 'Piece not found');

	const { data: images, error: imagesError } = await supabase
		.from('images')
		.select('id, piece_id, user_id, storage_path, uploaded_at, notes, is_cover, embedding')
		.eq('piece_id', params.id)
		.eq('user_id', user.id)
		.order('uploaded_at', { ascending: true });

	if (imagesError) error(500, 'Failed to load images');

	const storagePaths = (images ?? []).map((img) => img.storage_path);
	const signedUrls = await getSignedUrls(storagePaths);

	const imagesWithUrls: ImageWithUrl[] = (images ?? []).map((img) => ({
		id: img.id,
		piece_id: img.piece_id,
		user_id: img.user_id,
		storage_path: img.storage_path,
		uploaded_at: img.uploaded_at,
		notes: img.notes ?? null,
		is_cover: img.is_cover,
		embedding: img.embedding ?? null,
		url: signedUrls.get(img.storage_path) ?? ''
	}));

	const pieceWithImages: PieceWithImages = {
		id: piece.id,
		user_id: user.id,
		name: piece.name,
		description: piece.description ?? null,
		ai_description: piece.ai_description ?? null,
		created_at: piece.created_at,
		updated_at: piece.updated_at,
		cover_image_id: piece.cover_image_id ?? null,
		cover_embedding: piece.cover_embedding ?? null,
		images: imagesWithUrls
	};

	return { piece: pieceWithImages };
};
