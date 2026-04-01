import { resizeForApi } from './claude';
import { env } from '$env/dynamic/private';

const DEPTH_MODEL = 'depth-anything/Depth-Anything-V2-Small-hf';

export async function generateDepthMap(imageBuffer: Buffer): Promise<Buffer> {
	const token = env.HUGGINGFACE_TOKEN;
	if (!token) throw new Error('HUGGINGFACE_TOKEN not set');

	const { data: base64 } = await resizeForApi(imageBuffer);

	const resp = await fetch(`https://api-inference.huggingface.co/models/${DEPTH_MODEL}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			'x-wait-for-model': 'true'
		},
		body: JSON.stringify({ inputs: base64 }),
		signal: AbortSignal.timeout(120_000)
	});

	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`Depth estimation failed ${resp.status}: ${text}`);
	}

	return Buffer.from(await resp.arrayBuffer());
}
