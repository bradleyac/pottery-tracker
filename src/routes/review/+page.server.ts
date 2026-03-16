import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/server/supabase';
import { getSignedUrls } from '$lib/server/storage';
import type { PendingUploadWithUrls, PieceSummary } from '$lib/types';

export const load: PageServerLoad = async ({ locals: { safeGetSession }, depends }) => {
	depends('app:review');
	const { session, user } = await safeGetSession();
	if (!session || !user) redirect(303, '/auth');

	const supabase = createServiceRoleClient();

	// Fetch all pending uploads for this user
	const { data: uploads } = await supabase
		.from('pending_uploads')
		.select('*')
		.eq('user_id', user.id)
		.order('created_at', { ascending: true });

	if (!uploads || uploads.length === 0) {
		return { pendingUploads: [] as PendingUploadWithUrls[], pieces: [] as PieceSummary[] };
	}

	// Collect all storage paths to sign
	const tempPaths = uploads.map((u) => u.temp_storage_path);

	// Collect matched piece cover paths for 'ready' uploads
	const matchedPieceIds = uploads
		.filter((u) => u.status === 'ready' && u.matched_piece_id)
		.map((u) => u.matched_piece_id as string);

	// Fetch matched piece names and cover images
	const pieceNameMap = new Map<string, string>();
	const pieceCoverPathMap = new Map<string, string | null>();

	if (matchedPieceIds.length > 0) {
		const { data: matchedPieces } = await supabase
			.from('pieces')
			.select('id, name, cover_image_id')
			.in('id', matchedPieceIds);

		if (matchedPieces) {
			const coverImageIds = matchedPieces
				.map((p) => p.cover_image_id)
				.filter(Boolean) as string[];

			const coverImagePathMap = new Map<string, string>();
			if (coverImageIds.length > 0) {
				const { data: coverImages } = await supabase
					.from('images')
					.select('id, storage_path')
					.in('id', coverImageIds);

				if (coverImages) {
					for (const img of coverImages) {
						coverImagePathMap.set(img.id, img.storage_path);
					}
				}
			}

			for (const p of matchedPieces) {
				pieceNameMap.set(p.id, p.name);
				pieceCoverPathMap.set(
					p.id,
					p.cover_image_id ? (coverImagePathMap.get(p.cover_image_id) ?? null) : null
				);
			}
		}
	}

	// Fetch all user pieces for the override picker
	const { data: allPieces } = await supabase
		.from('pieces')
		.select('id, name, cover_image_id')
		.eq('user_id', user.id)
		.order('name', { ascending: true });

	const allPieceCoverIds = (allPieces ?? [])
		.map((p) => p.cover_image_id)
		.filter(Boolean) as string[];
	const allCoverPathMap = new Map<string, string>();

	if (allPieceCoverIds.length > 0) {
		const { data: coverImages } = await supabase
			.from('images')
			.select('id, storage_path')
			.in('id', allPieceCoverIds);

		if (coverImages) {
			for (const img of coverImages) {
				allCoverPathMap.set(img.id, img.storage_path);
			}
		}
	}

	// Gather all paths to sign at once
	const coverPathsToSign = [
		...new Set([
			...Array.from(pieceCoverPathMap.values()).filter(Boolean) as string[],
			...(allPieces ?? [])
				.map((p) => p.cover_image_id ? (allCoverPathMap.get(p.cover_image_id) ?? null) : null)
				.filter(Boolean) as string[]
		])
	];

	const allPathsToSign = [...tempPaths, ...coverPathsToSign];
	let signedUrlMap = new Map<string, string>();

	if (allPathsToSign.length > 0) {
		try {
			signedUrlMap = await getSignedUrls(allPathsToSign);
		} catch {
			// Non-fatal — images may not load
		}
	}

	const pendingUploads: PendingUploadWithUrls[] = uploads.map((u) => {
		const coverPath = u.matched_piece_id
			? (pieceCoverPathMap.get(u.matched_piece_id) ?? null)
			: null;
		return {
			...u,
			tempImageUrl: signedUrlMap.get(u.temp_storage_path) ?? '',
			matchedPieceCoverUrl: coverPath ? (signedUrlMap.get(coverPath) ?? null) : null,
			matchedPieceName: u.matched_piece_id ? (pieceNameMap.get(u.matched_piece_id) ?? null) : null
		};
	});

	const pieces: PieceSummary[] = (allPieces ?? []).map((p) => {
		const covPath = p.cover_image_id ? (allCoverPathMap.get(p.cover_image_id) ?? null) : null;
		return {
			id: p.id,
			name: p.name,
			cover_url: covPath ? (signedUrlMap.get(covPath) ?? null) : null
		};
	});

	return { pendingUploads, pieces };
};
