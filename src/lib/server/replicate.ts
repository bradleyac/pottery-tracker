import { env } from '$env/dynamic/private';
import sharp from 'sharp';

const DEFAULT_GLAZE_MODEL = 'black-forest-labs/flux-2-pro';

const GLAZE_PROMPT =
	'Apply the glaze from the second image to the pottery piece in the first image. Preserve the exact shape, proportions, surface texture, and any decorative elements of the piece — only the surface color and finish should change.';

async function resizeForReplicate(buffer: Buffer): Promise<string> {
	const resized = await sharp(buffer)
		.rotate()
		.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 82 })
		.toBuffer();
	return resized.toString('base64');
}

/**
 * Generate a glaze preview image by passing the unglazed piece and glaze reference
 * image directly to flux-2-pro. Returns a temporary Replicate CDN URL (~24h expiry).
 */
export async function generateGlazedImage(
	pieceBuffer: Buffer,
	glazeInspirationBuffer: Buffer
): Promise<string> {
	const token = env.REPLICATE_API_TOKEN;
	if (!token) throw new Error('REPLICATE_API_TOKEN not set');

	const model = env.REPLICATE_GLAZE_MODEL ?? DEFAULT_GLAZE_MODEL;

	const [pieceBase64, glazeBase64] = await Promise.all([
		resizeForReplicate(pieceBuffer),
		resizeForReplicate(glazeInspirationBuffer)
	]);

	const createResp = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			input: {
				prompt: GLAZE_PROMPT,
				input_images: [
					`data:image/jpeg;base64,${pieceBase64}`,
					`data:image/jpeg;base64,${glazeBase64}`
				],
				aspect_ratio: 'match_input_image',
				output_format: 'jpg',
				output_quality: 90
			}
		}),
		signal: AbortSignal.timeout(30_000)
	});

	if (!createResp.ok) {
		const text = await createResp.text();
		throw new Error(`Replicate create failed (${createResp.status}): ${text}`);
	}

	let prediction = await createResp.json();

	const deadline = Date.now() + 120_000;
	while (
		prediction.status !== 'succeeded' &&
		prediction.status !== 'failed' &&
		prediction.status !== 'canceled' &&
		Date.now() < deadline
	) {
		await new Promise((r) => setTimeout(r, 3000));
		const pollResp = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(15_000)
		});
		if (!pollResp.ok) throw new Error(`Replicate poll failed: ${pollResp.status}`);
		prediction = await pollResp.json();
	}

	if (prediction.status !== 'succeeded') {
		throw new Error(
			`Glaze preview failed: ${prediction.error ?? prediction.status}`
		);
	}

	const outputUrl: string = Array.isArray(prediction.output)
		? prediction.output[0]
		: prediction.output;
	if (!outputUrl) throw new Error('Replicate returned no output URL');

	return outputUrl;
}
