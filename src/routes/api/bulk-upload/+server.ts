import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { uploadImage, deleteImage } from '$lib/server/storage';
import { createServiceRoleClient } from '$lib/server/supabase';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

const MAX_FILES = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const formData = await request.formData();
	const files = formData.getAll('images[]') as File[];

	if (files.length === 0) error(400, 'No images provided');
	if (files.length > MAX_FILES) error(400, `Maximum ${MAX_FILES} files per upload`);

	// Upload all files in parallel, collecting results
	const uploadResults = await Promise.all(
		files.map(async (file) => {
			if (!file.type.startsWith('image/')) {
				return { ok: false as const, filename: file.name, reason: 'Not an image' };
			}
			if (file.size > MAX_FILE_SIZE) {
				return { ok: false as const, filename: file.name, reason: 'File too large (max 10 MB)' };
			}
			try {
				const rawBuffer = Buffer.from(await file.arrayBuffer());
				// Resize to 512px so the Edge Function can pass it directly to Anthropic
				const buffer = await sharp(rawBuffer)
					.rotate() // auto-orient from EXIF before resizing so tall portraits aren't rotated by rembg
					.resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
					.jpeg({ quality: 82 })
					.toBuffer();
				const uuid = randomUUID();
				const tempPath = `${user.id}/temp/${uuid}.jpg`;
				await uploadImage(buffer, tempPath, 'image/jpeg');
				return { ok: true as const, filename: file.name, tempPath };
			} catch {
				return { ok: false as const, filename: file.name, reason: 'Upload failed' };
			}
		})
	);

	const succeeded = uploadResults.filter((r) => r.ok);
	if (succeeded.length === 0) error(500, 'All uploads failed');

	// Batch-insert pending_uploads rows — all share a batch_id so Phase 2
	// consolidation can find them together on the review page.
	const supabase = createServiceRoleClient();
	const batchId = randomUUID();
	const rows = succeeded.map((r) => ({
		user_id: user.id,
		temp_storage_path: r.tempPath!,
		original_filename: r.filename,
		status: 'queued' as const,
		batch_id: batchId
	}));

	const { error: insertError } = await supabase.from('pending_uploads').insert(rows);
	if (insertError) {
		// Clean up orphaned temp objects so they don't accumulate
		await Promise.allSettled(succeeded.map((r) => deleteImage(r.tempPath!)));
		error(500, `Failed to queue uploads: ${insertError.message}`);
	}

	return json({ count: succeeded.length });
};
