import type { PageServerLoad } from './$types';
import { getSignedUrls } from '$lib/server/storage';
import type { PieceWithCover } from '$lib/types';
import { error } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const supabase = createServiceRoleClient();

	// Load pieces
	const { data: pieces, error: dbError } = await supabase
		.from('pieces')
		.select('id, user_id, name, description, ai_description, created_at, updated_at, cover_image_id')
		.eq('user_id', user.id)
		.order('updated_at', { ascending: false });

	if (dbError) error(500, 'Failed to load pieces');

	// Collect all cover image IDs to look up storage paths
	const coverImageIds = pieces.map((p) => p.cover_image_id).filter(Boolean) as string[];

	let coverPathMap = new Map<string, string>(); // image_id → storage_path

	if (coverImageIds.length > 0) {
		const { data: coverImages } = await supabase
			.from('images')
			.select('id, storage_path')
			.in('id', coverImageIds);

		if (coverImages) {
			for (const img of coverImages) {
				coverPathMap.set(img.id, img.storage_path);
			}
		}
	}

	// Sign all cover image URLs in one batch
	const coverPaths = Array.from(coverPathMap.values());
	const signedUrls = await getSignedUrls(coverPaths);

	const piecesWithCovers: PieceWithCover[] = pieces.map((p) => {
		const storagePath = p.cover_image_id ? coverPathMap.get(p.cover_image_id) : undefined;
		return {
			...p,
			description: p.description ?? null,
			ai_description: p.ai_description ?? null,
			cover_image_id: p.cover_image_id ?? null,
			cover_url: storagePath ? (signedUrls.get(storagePath) ?? null) : null
		};
	});

	return { pieces: piecesWithCovers };
};
