import { randomUUID } from 'crypto';
import { removeBackground } from './bgremove';
import type { ExistingPiece } from './claude';
import { describeNewPiece, generateImageEmbedding, resizeForApi } from './claude';
import {
	buildCleanImagePath,
	buildStoragePath,
	buildThumbnailPath,
	deleteCachedUrls,
	deleteImage,
	getSignedUrls,
	uploadImage
} from './storage';
import type { RawCandidate } from './strategies';
import { createServiceRoleClient } from './supabase';

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

	// Try to reuse the pre-built clean temp (stored by upload endpoint); fall back to running removal
	const cleanTempPath = tempPath.replace(/([^/]+\.jpg)$/, 'clean_$1');
	const { data: cleanTempData } = await supabase.storage.from('pottery-images').download(cleanTempPath);
	const cleanBuffer = cleanTempData
		? Buffer.from(await cleanTempData.arrayBuffer())
		: await removeBackground(buffer).catch(() => buffer);

	try {
		await deleteImage(tempPath);
	} catch {
		// ignore
	}
	await deleteImage(cleanTempPath).catch(() => { });
	await deleteCachedUrls([tempPath, cleanTempPath]).catch(() => { });

	let aiDescription = updatedDescription ?? null;
	if (!aiDescription) {
		try {
			aiDescription = await describeNewPiece(buffer, 'image/jpeg');
		} catch {
			// Non-fatal
		}
	}

	// Store background-removed image for future reprocessing
	try {
		await uploadImage(cleanBuffer, buildCleanImagePath(userId, pieceId, imageId), 'image/jpeg');
	} catch {
		// Non-fatal
	}

	// Store 1024px thumbnail for matching (from clean image)
	try {
		const { data: thumbData, mimeType: thumbMime } = await resizeForApi(cleanBuffer);
		const thumbPath = buildThumbnailPath(userId, pieceId, imageId);
		await uploadImage(Buffer.from(thumbData, 'base64'), thumbPath, thumbMime);
	} catch {
		// Non-fatal — matching will work without thumbnail
	}

	// Generate embedding for cover image (from clean image)
	let embedding: number[] | null = null;
	try {
		embedding = await generateImageEmbedding(cleanBuffer);
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

	// Try to reuse the pre-built clean temp (stored by upload endpoint or edge function)
	const cleanTempPath = tempPath.replace(/([^/]+\.jpg)$/, 'clean_$1');
	const { data: cleanTempData } = await supabase.storage.from('pottery-images').download(cleanTempPath);
	const cleanBuffer = cleanTempData
		? Buffer.from(await cleanTempData.arrayBuffer())
		: await removeBackground(buffer).catch(() => buffer);

	try {
		await deleteImage(tempPath);
	} catch {
		// Non-fatal
	}
	await deleteImage(cleanTempPath).catch(() => { });
	await deleteCachedUrls([tempPath, cleanTempPath]).catch(() => { });

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

		// Store background-removed image, thumbnail, depth map, and embedding from clean image
		try {
			await uploadImage(cleanBuffer, buildCleanImagePath(userId, pieceId, imageId), 'image/jpeg');
		} catch {
			// Non-fatal
		}

		try {
			const { data: thumbData, mimeType: thumbMime } = await resizeForApi(cleanBuffer);
			const thumbPath = buildThumbnailPath(userId, pieceId, imageId);
			await uploadImage(Buffer.from(thumbData, 'base64'), thumbPath, thumbMime);
		} catch {
			// Non-fatal
		}

		try {
			const embedding = await generateImageEmbedding(cleanBuffer);
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
): Promise<RawCandidate[]> {
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

	// Resolve cover image storage paths
	const coverImageIds = matchRows.map((m) => m.cover_image_id).filter(Boolean) as string[];
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

	return matchRows.map((m) => ({
		id: m.id,
		name: m.name,
		ai_description: m.ai_description,
		coverPath: m.cover_image_id ? (coverPathMap.get(m.cover_image_id) ?? null) : null
	}));
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
