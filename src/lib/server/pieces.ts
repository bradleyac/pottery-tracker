import { createServiceRoleClient } from './supabase';
import {
	uploadImage,
	deleteImage,
	buildStoragePath,
	buildThumbnailPath,
	buildDepthMapPath,
	getSignedUrls,
	downloadImage
} from './storage';
import { describeNewPiece, resizeForApi, generateImageEmbedding } from './claude';
import { generateDepthMap } from './depth';
import type { ExistingPiece } from './claude';
import { randomUUID } from 'crypto';

export type { ExistingPiece };

export async function getExistingPiecesForMatching(userId: string): Promise<{
	existingPieces: ExistingPiece[];
	coverPathMap: Map<string, string>;
}> {
	const supabase = createServiceRoleClient();

	const { data: pieces } = await supabase
		.from('pieces')
		.select('id, name, ai_description, cover_image_id')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });

	const coverImageIds = (pieces ?? []).map((p) => p.cover_image_id).filter(Boolean) as string[];
	const coverPathMap = new Map<string, string>();

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

	const existingPieces: ExistingPiece[] = (pieces ?? []).map((p) => ({
		id: p.id,
		name: p.name,
		ai_description: p.ai_description ?? null,
		cover_storage_path: p.cover_image_id ? (coverPathMap.get(p.cover_image_id) ?? null) : null
	}));

	return { existingPieces, coverPathMap };
}

export async function createPieceFromTemp(
	userId: string,
	tempPath: string,
	name: string,
	notes: string | null,
	updatedDescription: string | null
): Promise<{ pieceId: string }> {
	const supabase = createServiceRoleClient();

	const pieceId = randomUUID();
	const { error: pieceError } = await supabase.from('pieces').insert({
		id: pieceId,
		user_id: userId,
		name: name.trim(),
		ai_description: updatedDescription ?? null
	});

	if (pieceError) throw new Error(`Failed to create piece: ${pieceError.message}`);

	const { data: downloadData, error: downloadError } = await supabase.storage
		.from('pottery-images')
		.download(tempPath);

	if (downloadError || !downloadData) throw new Error('Failed to read temp image');

	const buffer = Buffer.from(await downloadData.arrayBuffer());
	const imageId = randomUUID();
	const permanentPath = buildStoragePath(userId, pieceId, imageId);

	await uploadImage(buffer, permanentPath, 'image/jpeg');

	try {
		await deleteImage(tempPath);
	} catch {
		// ignore
	}

	let aiDescription = updatedDescription ?? null;
	if (!aiDescription) {
		try {
			aiDescription = await describeNewPiece(buffer, 'image/jpeg');
		} catch {
			// Non-fatal
		}
	}

	// Store 512px thumbnail for matching
	try {
		const { data: thumbData, mimeType: thumbMime } = await resizeForApi(buffer);
		const thumbPath = buildThumbnailPath(userId, pieceId, imageId);
		await uploadImage(Buffer.from(thumbData, 'base64'), thumbPath, thumbMime);
	} catch {
		// Non-fatal — matching will work without thumbnail
	}

	// Store depth map for 3D profile matching
	try {
		const depthBuffer = await generateDepthMap(buffer);
		const depthPath = buildDepthMapPath(userId, pieceId, imageId);
		await uploadImage(depthBuffer, depthPath, 'image/jpeg');
	} catch (err) {
		console.error('Depth map generation failed (non-fatal):', err);
	}

	// Generate embedding for cover image
	let embedding: number[] | null = null;
	try {
		embedding = await generateImageEmbedding(buffer);
	} catch {
		// Non-fatal — piece won't appear as a candidate until embedding is generated
	}

	const { error: imageError } = await supabase.from('images').insert({
		id: imageId,
		piece_id: pieceId,
		user_id: userId,
		storage_path: permanentPath,
		notes: notes ?? null,
		is_cover: true
	});

	if (imageError) throw new Error(`Failed to save image: ${imageError.message}`);

	const pieceUpdate: Record<string, unknown> = {
		cover_image_id: imageId,
		ai_description: aiDescription
	};
	if (embedding) {
		pieceUpdate.cover_embedding = JSON.stringify(embedding);
	}

	await supabase.from('pieces').update(pieceUpdate).eq('id', pieceId);

	return { pieceId };
}

export async function addImageToExistingPiece(
	userId: string,
	pieceId: string,
	tempPath: string,
	notes: string | null,
	updatedDescription: string | null
): Promise<{ imageId: string; pieceId: string }> {
	const supabase = createServiceRoleClient();

	const { data: piece, error: pieceError } = await supabase
		.from('pieces')
		.select('id, user_id, cover_image_id, ai_description')
		.eq('id', pieceId)
		.eq('user_id', userId)
		.single();

	if (pieceError || !piece) throw new Error('Piece not found');

	const { data: downloadData, error: downloadError } = await supabase.storage
		.from('pottery-images')
		.download(tempPath);

	if (downloadError || !downloadData) throw new Error('Failed to read temp image');

	const buffer = Buffer.from(await downloadData.arrayBuffer());
	const imageId = randomUUID();
	const permanentPath = buildStoragePath(userId, pieceId, imageId);

	await uploadImage(buffer, permanentPath, 'image/jpeg');

	try {
		await deleteImage(tempPath);
	} catch {
		// Non-fatal
	}

	const isFirstImage = !piece.cover_image_id;
	const { error: insertError } = await supabase.from('images').insert({
		id: imageId,
		piece_id: pieceId,
		user_id: userId,
		storage_path: permanentPath,
		notes: notes ?? null,
		is_cover: isFirstImage
	});

	if (insertError) throw new Error(`Failed to save image: ${insertError.message}`);

	const updates: Record<string, unknown> = {};
	if (isFirstImage) {
		updates.cover_image_id = imageId;

		// Store thumbnail and embedding for the new cover image
		try {
			const { data: thumbData, mimeType: thumbMime } = await resizeForApi(buffer);
			const thumbPath = buildThumbnailPath(userId, pieceId, imageId);
			await uploadImage(Buffer.from(thumbData, 'base64'), thumbPath, thumbMime);
		} catch {
			// Non-fatal
		}

		try {
			const depthBuffer = await generateDepthMap(buffer);
			const depthPath = buildDepthMapPath(userId, pieceId, imageId);
			await uploadImage(depthBuffer, depthPath, 'image/jpeg');
		} catch {
			// Non-fatal
		}

		try {
			const embedding = await generateImageEmbedding(buffer);
			updates.cover_embedding = JSON.stringify(embedding);
		} catch {
			// Non-fatal
		}
	}

	const needsDescription = !piece.ai_description;
	if (needsDescription) {
		const newDescription =
			updatedDescription ?? (await describeNewPiece(buffer, 'image/jpeg').catch(() => null));
		if (newDescription) updates.ai_description = newDescription;
	}

	if (Object.keys(updates).length > 0) {
		await supabase.from('pieces').update(updates).eq('id', pieceId);
	}

	return { imageId, pieceId };
}

export async function addImageBufferToPiece(
	userId: string,
	pieceId: string,
	buffer: Buffer,
	contentType: string,
	notes: string | null
): Promise<{ imageId: string; pieceId: string }> {
	const supabase = createServiceRoleClient();

	const { data: piece, error: pieceError } = await supabase
		.from('pieces')
		.select('id, user_id, cover_image_id, ai_description')
		.eq('id', pieceId)
		.eq('user_id', userId)
		.single();

	if (pieceError || !piece) throw new Error('Piece not found');

	const imageId = randomUUID();
	const permanentPath = buildStoragePath(userId, pieceId, imageId);

	await uploadImage(buffer, permanentPath, contentType);

	const isFirstImage = !piece.cover_image_id;
	const { error: insertError } = await supabase.from('images').insert({
		id: imageId,
		piece_id: pieceId,
		user_id: userId,
		storage_path: permanentPath,
		notes: notes ?? null,
		is_cover: isFirstImage
	});

	if (insertError) throw new Error(`Failed to save image: ${insertError.message}`);

	const updates: Record<string, unknown> = {};
	if (isFirstImage) {
		updates.cover_image_id = imageId;

		try {
			const { data: thumbData, mimeType: thumbMime } = await resizeForApi(buffer);
			const thumbPath = buildThumbnailPath(userId, pieceId, imageId);
			await uploadImage(Buffer.from(thumbData, 'base64'), thumbPath, thumbMime);
		} catch {
			// Non-fatal
		}

		try {
			const depthBuffer = await generateDepthMap(buffer);
			const depthPath = buildDepthMapPath(userId, pieceId, imageId);
			await uploadImage(depthBuffer, depthPath, 'image/jpeg');
		} catch {
			// Non-fatal
		}

		try {
			const embedding = await generateImageEmbedding(buffer);
			updates.cover_embedding = JSON.stringify(embedding);
		} catch {
			// Non-fatal
		}
	}

	if (!piece.ai_description) {
		const newDescription = await describeNewPiece(buffer).catch(() => null);
		if (newDescription) updates.ai_description = newDescription;
	}

	if (Object.keys(updates).length > 0) {
		await supabase.from('pieces').update(updates).eq('id', pieceId);
	}

	return { imageId, pieceId };
}

export async function getCandidatesByEmbedding(
	userId: string,
	embedding: number[],
	limit = 8
): Promise<ExistingPiece[]> {
	const supabase = createServiceRoleClient();

	const { data: matches, error } = await supabase.rpc('match_pieces', {
		query_embedding: JSON.stringify(embedding),
		match_user_id: userId,
		match_count: limit
	});

	if (error) throw new Error(`Embedding search failed: ${error.message}`);

	const matchRows = matches as
		| { id: string; name: string; ai_description: string | null; cover_image_id: string | null }[]
		| null;
	if (!matchRows || matchRows.length === 0) return [];

	// Get cover image paths for thumbnail download
	const coverImageIds = matchRows
		.map((m) => m.cover_image_id)
		.filter(Boolean) as string[];

	const coverPathMap = new Map<string, string>();
	if (coverImageIds.length > 0) {
		const { data: coverImages } = await supabase
			.from('images')
			.select('id, storage_path, piece_id, user_id')
			.in('id', coverImageIds);

		if (coverImages) {
			for (const img of coverImages) {
				coverPathMap.set(img.id, img.storage_path);
			}
		}
	}

	// Download depth maps (primary) and thumbnails (fallback) in parallel
	const candidates = await Promise.all(
		matchRows.map(async (m) => {
			const coverPath = m.cover_image_id ? coverPathMap.get(m.cover_image_id) : null;
			let depthMapBase64: string | null = null;
			let coverImageBase64: string | null = null;

			if (coverPath) {
				// Try depth map first
				try {
					const depthPath = coverPath.replace(/\/([^/]+)\.jpg$/, '/depth_$1.jpg');
					const depthBuffer = await downloadImage(depthPath);
					depthMapBase64 = depthBuffer.toString('base64');
				} catch {
					// No depth map — fall back to thumbnail for this candidate
				}

				// Always try to get thumbnail as fallback
				if (!depthMapBase64) {
					try {
						const thumbPath = coverPath.replace(/\/([^/]+)\.jpg$/, '/thumb_$1.jpg');
						const thumbBuffer = await downloadImage(thumbPath);
						coverImageBase64 = thumbBuffer.toString('base64');
					} catch {
						try {
							const fullBuffer = await downloadImage(coverPath);
							const { data } = await resizeForApi(fullBuffer);
							coverImageBase64 = data;
						} catch {
							// Skip this candidate's image
						}
					}
				}
			}

			return {
				id: m.id,
				name: m.name,
				ai_description: m.ai_description,
				cover_storage_path: coverPath ?? null,
				coverImageBase64,
				depthMapBase64
			} satisfies ExistingPiece;
		})
	);

	return candidates;
}

export async function getPieceCoverUrls(
	existingPieces: ExistingPiece[],
	coverPathMap: Map<string, string>
): Promise<Map<string, string>> {
	const coverPaths = existingPieces
		.map((p) => p.cover_storage_path)
		.filter((p): p is string => p !== null);

	if (coverPaths.length === 0) return new Map();

	try {
		return await getSignedUrls(coverPaths);
	} catch {
		return new Map();
	}
}
