import { createServiceRoleClient } from './supabase';

const BUCKET = 'pottery-images';

export async function uploadImage(
	buffer: Buffer,
	storagePath: string,
	contentType: string
): Promise<string> {
	const supabase = createServiceRoleClient();

	const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
		contentType,
		upsert: false
	});

	if (error) throw new Error(`Storage upload failed: ${error.message}`);

	return storagePath;
}

export async function getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
	const supabase = createServiceRoleClient();

	const { data, error } = await supabase.storage
		.from(BUCKET)
		.createSignedUrl(storagePath, expiresIn);

	if (error) throw new Error(`Failed to create signed URL: ${error.message}`);

	return data.signedUrl;
}

export async function getSignedUrls(
	storagePaths: string[],
	expiresIn = 3600
): Promise<Map<string, string>> {
	if (storagePaths.length === 0) return new Map();

	const supabase = createServiceRoleClient();

	const { data, error } = await supabase.storage
		.from(BUCKET)
		.createSignedUrls(storagePaths, expiresIn);

	if (error) throw new Error(`Failed to create signed URLs: ${error.message}`);

	const urlMap = new Map<string, string>();
	for (const item of data) {
		if (item.signedUrl && item.path) {
			urlMap.set(item.path, item.signedUrl);
		}
	}

	return urlMap;
}

export async function deleteImage(storagePath: string): Promise<void> {
	const supabase = createServiceRoleClient();

	const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);

	if (error) throw new Error(`Storage delete failed: ${error.message}`);
}

export function buildStoragePath(userId: string, pieceId: string, imageId: string): string {
	return `${userId}/${pieceId}/${imageId}.jpg`;
}

export function buildThumbnailPath(userId: string, pieceId: string, imageId: string): string {
	return `${userId}/${pieceId}/thumb_${imageId}.jpg`;
}

export function buildCleanImagePath(userId: string, pieceId: string, imageId: string): string {
	return `${userId}/${pieceId}/clean_${imageId}.jpg`;
}

export async function downloadImage(storagePath: string): Promise<Buffer> {
	const supabase = createServiceRoleClient();

	const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);

	if (error || !data) throw new Error(`Failed to download image: ${error?.message}`);

	return Buffer.from(await data.arrayBuffer());
}
