import { createServiceRoleClient } from './supabase';
import { uploadImage, deleteImage, buildStoragePath, getSignedUrls } from './storage';
import { describeNewPiece } from './claude';
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

	const { error: imageError } = await supabase.from('images').insert({
		id: imageId,
		piece_id: pieceId,
		user_id: userId,
		storage_path: permanentPath,
		notes: notes ?? null,
		is_cover: true
	});

	if (imageError) throw new Error(`Failed to save image: ${imageError.message}`);

	await supabase
		.from('pieces')
		.update({ cover_image_id: imageId, ai_description: aiDescription })
		.eq('id', pieceId);

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
	if (isFirstImage) updates.cover_image_id = imageId;

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
	if (isFirstImage) updates.cover_image_id = imageId;

	if (!piece.ai_description) {
		const newDescription = await describeNewPiece(buffer).catch(() => null);
		if (newDescription) updates.ai_description = newDescription;
	}

	if (Object.keys(updates).length > 0) {
		await supabase.from('pieces').update(updates).eq('id', pieceId);
	}

	return { imageId, pieceId };
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
