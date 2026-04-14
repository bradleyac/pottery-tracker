import type { ReplicateModelConfig } from './types.ts';

const GLAZE_PROMPT_PREFIX =
	'Apply the following glaze to the surface of this pottery piece, preserving its exact shape, proportions, surface texture, and any decorative elements — only change the surface color and finish: ';

/**
 * Named Replicate model configs for image generation.
 * Each config specifies the model and how to build the API input payload.
 */
export const REPLICATE_MODELS: ReplicateModelConfig[] = [
	{
		name: 'flux-kontext-pro',
		model: 'black-forest-labs/flux-kontext-pro',
		buildInput(pieceBase64, glazeDescription) {
			return {
				prompt: GLAZE_PROMPT_PREFIX + glazeDescription,
				input_image: `data:image/jpeg;base64,${pieceBase64}`
			};
		}
	},
	{
		name: 'flux-kontext-dev',
		model: 'black-forest-labs/flux-kontext-dev',
		buildInput(pieceBase64, glazeDescription) {
			return {
				prompt: GLAZE_PROMPT_PREFIX + glazeDescription,
				input_image: `data:image/jpeg;base64,${pieceBase64}`
			};
		}
	}
];

export function getReplicateModels(names?: string[]): ReplicateModelConfig[] {
	if (!names || names.length === 0) return REPLICATE_MODELS;
	return names.map((name) => {
		const found = REPLICATE_MODELS.find((m) => m.name === name);
		if (!found) {
			console.error(
				`Unknown Replicate model: "${name}". Available: ${REPLICATE_MODELS.map((m) => m.name).join(', ')}`
			);
			process.exit(1);
		}
		return found;
	});
}

/**
 * Call Replicate to generate a glazed image.
 * Uses the models/{owner}/{name}/predictions endpoint (no version hash needed).
 * Polls until the prediction succeeds or fails (max ~120s).
 * Returns the output image as a Buffer.
 */
export async function runReplicatePrediction(
	modelConfig: ReplicateModelConfig,
	pieceBase64: string,
	glazeDescription: string,
	apiToken: string
): Promise<Buffer> {
	const input = modelConfig.buildInput(pieceBase64, glazeDescription);

	// Start prediction
	const createResp = await fetch(
		`https://api.replicate.com/v1/models/${modelConfig.model}/predictions`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ input }),
			signal: AbortSignal.timeout(30_000)
		}
	);

	if (!createResp.ok) {
		const text = await createResp.text();
		throw new Error(`Replicate create failed (${createResp.status}): ${text}`);
	}

	let prediction = await createResp.json();

	// Poll until done
	const deadline = Date.now() + 120_000;
	while (
		prediction.status !== 'succeeded' &&
		prediction.status !== 'failed' &&
		prediction.status !== 'canceled' &&
		Date.now() < deadline
	) {
		await new Promise((r) => setTimeout(r, 3000));
		const pollResp = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
			headers: { Authorization: `Bearer ${apiToken}` },
			signal: AbortSignal.timeout(15_000)
		});
		if (!pollResp.ok) throw new Error(`Replicate poll failed: ${pollResp.status}`);
		prediction = await pollResp.json();
	}

	if (prediction.status !== 'succeeded') {
		throw new Error(
			`Replicate prediction ${prediction.status}: ${prediction.error ?? 'unknown error'}`
		);
	}

	const outputUrl: string = Array.isArray(prediction.output)
		? prediction.output[0]
		: prediction.output;
	if (!outputUrl) throw new Error('Replicate returned no output URL');

	const imgResp = await fetch(outputUrl, { signal: AbortSignal.timeout(60_000) });
	if (!imgResp.ok) throw new Error(`Failed to download generated image: ${imgResp.status}`);
	return Buffer.from(await imgResp.arrayBuffer());
}
