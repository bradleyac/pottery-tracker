import sharp from 'sharp';
import { env } from '$env/dynamic/private';

const DEPTH_MODEL = 'depth-anything/Depth-Anything-V2-Small-hf';

export async function generateDepthMap(imageBuffer: Buffer): Promise<Buffer> {
	const token = env.HUGGINGFACE_TOKEN;
	if (!token) throw new Error('HUGGINGFACE_TOKEN not set');

	// Resize to 512px and send as raw binary (required format for HF image models)
	const resized = await sharp(imageBuffer)
		.resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 82 })
		.toBuffer();

	const resp = await fetch(`https://api-inference.huggingface.co/models/${DEPTH_MODEL}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/octet-stream',
			'x-wait-for-model': 'true'
		},
		body: new Uint8Array(resized),
		signal: AbortSignal.timeout(120_000)
	});

	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`Depth estimation failed ${resp.status}: ${text}`);
	}

	return Buffer.from(await resp.arrayBuffer());
}
