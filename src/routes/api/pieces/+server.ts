import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { describeNewPiece } from '$lib/server/claude';
import { uploadImage, deleteImage, buildStoragePath } from '$lib/server/storage';
import { randomUUID } from 'crypto';

// POST: create a new piece and attach the temp image to it
export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const body = await request.json();
	const { tempPath, name, notes, updatedDescription } = body as {
		tempPath: string;
		name: string;
		notes?: string;
		updatedDescription?: string;
	};

	if (!tempPath || !name?.trim()) {
		error(400, 'tempPath and name are required');
	}

	const supabase = createServiceRoleClient();

	let aiDescription = updatedDescription ?? null;

	// Create piece row
	const pieceId = randomUUID();
	const { error: pieceError } = await supabase.from('pieces').insert({
		id: pieceId,
		user_id: user.id,
		name: name.trim(),
		ai_description: aiDescription
	});

	if (pieceError) error(500, `Failed to create piece: ${pieceError.message}`);

	// Download temp image from storage
	const { data: downloadData, error: downloadError } = await supabase.storage
		.from('pottery-images')
		.download(tempPath);

	if (downloadError || !downloadData) {
		error(500, 'Failed to read temp image');
	}

	const buffer = Buffer.from(await downloadData.arrayBuffer());

	// Move to permanent path
	const imageId = randomUUID();
	const permanentPath = buildStoragePath(user.id, pieceId, imageId);

	await uploadImage(buffer, permanentPath, 'image/jpeg');

	// Delete temp file (non-fatal)
	try {
		await deleteImage(tempPath);
	} catch {
		// ignore
	}

	// Generate AI description if not provided
	if (!aiDescription) {
		try {
			aiDescription = await describeNewPiece(buffer, 'image/jpeg');
		} catch {
			// Non-fatal
		}
	}

	// Insert image row
	const { error: imageError } = await supabase.from('images').insert({
		id: imageId,
		piece_id: pieceId,
		user_id: user.id,
		storage_path: permanentPath,
		notes: notes ?? null,
		is_cover: true
	});

	if (imageError) error(500, `Failed to save image: ${imageError.message}`);

	// Set cover_image_id and ai_description on piece
	await supabase
		.from('pieces')
		.update({ cover_image_id: imageId, ai_description: aiDescription })
		.eq('id', pieceId);

	return json({ pieceId });
};
