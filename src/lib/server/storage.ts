import { createServiceRoleClient } from './supabase';

const BUCKET = 'pottery-images';
const CACHE_BUFFER_MS = 10 * 60 * 1000; // 10 minutes

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
	const urlMap = await getSignedUrls([storagePath], expiresIn);
	const url = urlMap.get(storagePath);
	if (!url) throw new Error(`Failed to create signed URL for: ${storagePath}`);
	return url;
}

export async function getSignedUrls(
	storagePaths: string[],
	expiresIn = 3600
): Promise<Map<string, string>> {
	if (storagePaths.length === 0) return new Map();

	const supabase = createServiceRoleClient();
	const now = Date.now();
	const minExpiry = new Date(now + CACHE_BUFFER_MS).toISOString();

	// 1. Batch cache lookup
	const { data: cachedRows } = await supabase
		.from('signed_url_cache')
		.select('storage_path, signed_url')
		.in('storage_path', storagePaths)
		.gt('expires_at', minExpiry);

	const urlMap = new Map<string, string>();
	const missedPaths: string[] = [];

	const cachedByPath = new Map((cachedRows ?? []).map((r) => [r.storage_path, r.signed_url]));

	for (const path of storagePaths) {
		const cached = cachedByPath.get(path);
		if (cached) {
			urlMap.set(path, cached);
		} else {
			missedPaths.push(path);
		}
	}

	if (missedPaths.length === 0) return urlMap;

	// 2. Sign only uncached paths
	const { data, error } = await supabase.storage
		.from(BUCKET)
		.createSignedUrls(missedPaths, expiresIn);

	if (error) throw new Error(`Failed to create signed URLs: ${error.message}`);

	const expiresAt = new Date(now + expiresIn * 1000).toISOString();
	const upsertRows: Array<{ storage_path: string; signed_url: string; expires_at: string }> = [];

	for (const item of data) {
		if (item.signedUrl && item.path) {
			urlMap.set(item.path, item.signedUrl);
			upsertRows.push({ storage_path: item.path, signed_url: item.signedUrl, expires_at: expiresAt });
		}
	}

	// 3. Fire-and-forget upsert — cache write failure degrades gracefully
	if (upsertRows.length > 0) {
		supabase
			.from('signed_url_cache')
			.upsert(upsertRows, { onConflict: 'storage_path' })
			.then(({ error: e }) => {
				if (e) console.error('[signed_url_cache] upsert failed:', e.message);
			});
	}

	// 4. Opportunistic cleanup of expired rows (~5% of requests)
	if (Math.random() < 0.05) {
		supabase
			.from('signed_url_cache')
			.delete()
			.lt('expires_at', new Date(now).toISOString())
			.then(() => { });
	}

	return urlMap;
}

export async function deleteCachedUrls(storagePaths: string[]): Promise<void> {
	if (storagePaths.length === 0) return;
	const supabase = createServiceRoleClient();
	await supabase.from('signed_url_cache').delete().in('storage_path', storagePaths);
	// Errors are non-fatal; the 10-minute buffer prevents serving stale URLs
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
