import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import sharp from 'sharp';

const DEFAULT_BG_REMOVE_MODEL =
	'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';

// ── Cache ────────────────────────────────────────────────────────────────────

export class BgRemovalCache {
	constructor(private cacheDir: string) {}

	private keyPath(rawBuffer: Buffer): string {
		const hash = createHash('sha256').update(rawBuffer).digest('hex');
		return join(this.cacheDir, 'bg-removed', `${hash}.jpg`);
	}

	async get(rawBuffer: Buffer): Promise<Buffer | null> {
		try {
			return await readFile(this.keyPath(rawBuffer));
		} catch {
			return null;
		}
	}

	async set(rawBuffer: Buffer, removedBuffer: Buffer): Promise<void> {
		const path = this.keyPath(rawBuffer);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, removedBuffer);
	}
}

// ── Background removal via Replicate ─────────────────────────────────────────

export async function removeBackground(
	buffer: Buffer,
	token: string,
	model: string = DEFAULT_BG_REMOVE_MODEL
): Promise<Buffer> {
	const resized = await sharp(buffer)
		.rotate()
		.resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 90 })
		.toBuffer();

	let createResp: Response | null = null;
	for (let attempt = 0; attempt < 5; attempt++) {
		createResp = await fetch('https://api.replicate.com/v1/predictions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				Prefer: 'wait'
			},
			body: JSON.stringify({
				version: model,
				input: { image: `data:image/jpeg;base64,${resized.toString('base64')}` }
			}),
			signal: AbortSignal.timeout(60_000)
		});

		if (createResp.status !== 429) break;

		const retryBody = await createResp.json().catch(() => ({}));
		const waitMs = ((retryBody.retry_after ?? 1) + 1) * 1000;
		console.log(`  [bgremove] Rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1})`);
		await new Promise((r) => setTimeout(r, waitMs));
	}

	if (!createResp!.ok) {
		const text = await createResp!.text();
		throw new Error(`Background removal failed ${createResp!.status}: ${text}`);
	}

	const prediction = await createResp!.json();
	if (prediction.status === 'failed') {
		throw new Error(`Background removal prediction failed: ${prediction.error}`);
	}

	const outputUrl: string = prediction.output;
	if (!outputUrl) throw new Error('Background removal returned no output');

	const imgResp = await fetch(outputUrl, { signal: AbortSignal.timeout(30_000) });
	if (!imgResp.ok) throw new Error(`Failed to download bg-removed image: ${imgResp.status}`);
	const pngBuffer = Buffer.from(await imgResp.arrayBuffer());

	return sharp(pngBuffer)
		.flatten({ background: { r: 255, g: 255, b: 255 } })
		.jpeg({ quality: 90 })
		.toBuffer();
}
