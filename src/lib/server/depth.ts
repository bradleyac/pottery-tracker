import sharp from 'sharp';
import { env } from '$env/dynamic/private';

const DEFAULT_DEPTH_VERSION =
	'chenxwh/depth-anything-v2:b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4';

export async function generateDepthMap(imageBuffer: Buffer): Promise<Buffer> {
	const token = env.REPLICATE_API_TOKEN;
	if (!token) throw new Error('REPLICATE_API_TOKEN not set');

	const version = env.REPLICATE_DEPTH_MODEL ?? DEFAULT_DEPTH_VERSION;

	const resized = await sharp(imageBuffer)
		.rotate() // auto-orient from EXIF before resizing
		.resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 82 })
		.toBuffer();

	// Trim white border left by background removal to maximise piece size in frame
	let cropped: Buffer;
	try {
		cropped = await sharp(resized).trim().toBuffer();
	} catch {
		cropped = resized;
	}

	const base64 = cropped.toString('base64');

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
				input: { image: `data:image/jpeg;base64,${base64}`, model_size: 'Base' }
			}),
			signal: AbortSignal.timeout(90_000)
		});

		if (createResp.status !== 429) break;

		const retryBody = await createResp.json().catch(() => ({}));
		const waitMs = ((retryBody.retry_after ?? 1) + 1) * 1000;
		console.log(`[depth] Replicate rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1})`);
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}

	if (!createResp!.ok) {
		const text = await createResp!.text();
		throw new Error(`Replicate prediction failed ${createResp!.status}: ${text}`);
	}

	const prediction = await createResp!.json();
	if (prediction.status === 'failed') {
		throw new Error(`Replicate prediction failed: ${prediction.error}`);
	}

	const outputUrl: string = prediction.output?.grey_depth;
	if (!outputUrl) throw new Error('Replicate returned no output');

	const imgResp = await fetch(outputUrl, { signal: AbortSignal.timeout(30_000) });
	if (!imgResp.ok) throw new Error(`Failed to download depth map: ${imgResp.status}`);

	return Buffer.from(await imgResp.arrayBuffer());
}
