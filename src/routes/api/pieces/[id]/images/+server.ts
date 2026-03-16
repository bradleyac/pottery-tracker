import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { uploadImage, deleteImage, buildStoragePath } from '$lib/server/storage';
import { describeNewPiece } from '$lib/server/claude';
import { randomUUID } from 'crypto';

// POST: attach a temp-uploaded image to an existing piece
export const POST: RequestHandler = async ({
	request,
	params,
	locals: { safeGetSession }
}) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const pieceId = params.id;
	const body = await request.json();
	const { tempPath, notes, updatedDescription } = body as {
		tempPath: string;
		notes?: string;
		updatedDescription?: string;
	};

	if (!tempPath) error(400, 'tempPath is required');

	const supabase = createServiceRoleClient();

	// Verify piece belongs to user
	const { data: piece, error: pieceError } = await supabase
		.from('pieces')
		.select('id, user_id, cover_image_id')
		.eq('id', pieceId)
		.eq('user_id', user.id)
		.single();

	if (pieceError || !piece) error(404, 'Piece not found');

	// Download temp image
	const { data: downloadData, error: downloadError } = await supabase.storage
		.from('pottery-images')
		.download(tempPath);

	if (downloadError || !downloadData) error(500, 'Failed to read temp image');

	const buffer = Buffer.from(await downloadData.arrayBuffer());

	// Move to permanent path
	const imageId = randomUUID();
	const permanentPath = buildStoragePath(user.id, pieceId, imageId);

	await uploadImage(buffer, permanentPath, 'image/jpeg');

	try {
		await deleteImage(tempPath);
	} catch {
		// Non-fatal
	}

	// Insert image row
	const isFirstImage = !piece.cover_image_id;
	const { error: insertError } = await supabase.from('images').insert({
		id: imageId,
		piece_id: pieceId,
		user_id: user.id,
		storage_path: permanentPath,
		notes: notes ?? null,
		is_cover: isFirstImage
	});

	if (insertError) error(500, `Failed to save image: ${insertError.message}`);

	// Update piece: set cover if first image, refresh ai_description
	const updates: Record<string, unknown> = {};

	if (isFirstImage) {
		updates.cover_image_id = imageId;
	}

	// Regenerate AI description with latest image
	let newDescription = updatedDescription ?? null;
	if (!newDescription) {
		try {
			newDescription = await describeNewPiece(buffer, 'image/jpeg');
		} catch {
			// Non-fatal
		}
	}
	if (newDescription) {
		updates.ai_description = newDescription;
	}

	if (Object.keys(updates).length > 0) {
		await supabase.from('pieces').update(updates).eq('id', pieceId);
	}

	return json({ imageId, pieceId });
};
