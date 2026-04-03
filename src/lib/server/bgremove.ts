import sharp from 'sharp';
import { env } from '$env/dynamic/private';

const DEFAULT_BG_REMOVE_VERSION =
	'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';

export async function removeBackground(buffer: Buffer): Promise<Buffer> {
	const token = env.REPLICATE_API_TOKEN;
	if (!token) throw new Error('REPLICATE_API_TOKEN not set');

	const version = env.REPLICATE_BG_REMOVE_MODEL ?? DEFAULT_BG_REMOVE_VERSION;

	const resized = await sharp(buffer)
		.rotate() // auto-orient from EXIF before resizing so tall portraits aren't rotated by rembg
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
				version,
				input: { image: `data:image/jpeg;base64,${resized.toString('base64')}` }
			}),
			signal: AbortSignal.timeout(60_000)
		});

		if (createResp.status !== 429) break;

		const retryBody = await createResp.json().catch(() => ({}));
		const waitMs = ((retryBody.retry_after ?? 1) + 1) * 1000;
		console.log(`[bgremove] Replicate rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1})`);
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
	if (!imgResp.ok) throw new Error(`Failed to download background-removed image: ${imgResp.status}`);
	const pngBuffer = Buffer.from(await imgResp.arrayBuffer());

	return sharp(pngBuffer)
		.flatten({ background: { r: 255, g: 255, b: 255 } })
		.jpeg({ quality: 90 })
		.toBuffer();
}
