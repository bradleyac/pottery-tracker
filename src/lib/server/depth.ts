import sharp from 'sharp';
import { env } from '$env/dynamic/private';
import { detectPieceBounds } from './claude';

const DEFAULT_DEPTH_VERSION =
	'chenxwh/depth-anything-v2:b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4';

export async function generateDepthMap(imageBuffer: Buffer): Promise<Buffer> {
	const token = env.REPLICATE_API_TOKEN;
	if (!token) throw new Error('REPLICATE_API_TOKEN not set');

	const version = env.REPLICATE_DEPTH_MODEL ?? DEFAULT_DEPTH_VERSION;

	const resized = await sharp(imageBuffer)
		.resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 82 })
		.toBuffer();

	// Crop to the piece before depth estimation to maximise depth resolution
	let cropped = resized;
	try {
		const bounds = await detectPieceBounds(resized);
		if (bounds) {
			const { width: w = 512, height: h = 512 } = await sharp(resized).metadata();
			const PAD = 0.05;
			const left = Math.max(0, Math.floor((bounds.x1 - PAD) * w));
			const top = Math.max(0, Math.floor((bounds.y1 - PAD) * h));
			const right = Math.min(w, Math.ceil((bounds.x2 + PAD) * w));
			const bottom = Math.min(h, Math.ceil((bounds.y2 + PAD) * h));
			cropped = await sharp(resized)
				.extract({ left, top, width: right - left, height: bottom - top })
				.toBuffer();
		}
	} catch {
		// Non-fatal — fall back to full resized image
	}

	const base64 = cropped.toString('base64');

	const createResp = await fetch('https://api.replicate.com/v1/predictions', {
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

	if (!createResp.ok) {
		const text = await createResp.text();
		throw new Error(`Replicate prediction failed ${createResp.status}: ${text}`);
	}

	const prediction = await createResp.json();
	if (prediction.status === 'failed') {
		throw new Error(`Replicate prediction failed: ${prediction.error}`);
	}

	const outputUrl: string = prediction.output?.grey_depth;
	if (!outputUrl) throw new Error('Replicate returned no output');

	const imgResp = await fetch(outputUrl, { signal: AbortSignal.timeout(30_000) });
	if (!imgResp.ok) throw new Error(`Failed to download depth map: ${imgResp.status}`);

	return Buffer.from(await imgResp.arrayBuffer());
}
