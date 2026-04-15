import type { PromptConfig } from './types.ts';

/**
 * Named prompt variants for the flux-2-dev glaze preview call.
 * All variants pass two images: piece (image 1) and glaze reference (image 2).
 */
export const PROMPTS: PromptConfig[] = [
	{
		name: 'v5-color-only',
		prompt:
			'The second image is used only as a color and finish reference — extract only its glaze color, opacity, and surface sheen. Apply that glaze to the pottery piece in the first image. Do not transfer any form, decoration, carving, cutout, or surface texture from the second image. The output piece must be identical in shape and surface detail to the first image; only the glaze color changes.'
	},
	{
		name: 'v6-explicit-separation',
		prompt:
			'Image 1: an unglazed pottery piece — its shape and all surface details (carving, texture, decoration) must appear unchanged in the output. Image 2: a glazed piece used as a color reference only — ignore its shape, ignore its decoration, ignore its surface texture; extract only the color, tone, and glossiness of the glaze. Output: the piece from Image 1 with only the glaze color and finish from Image 2 applied.'
	}
];

export function getPrompts(names?: string[]): PromptConfig[] {
	if (!names || names.length === 0) return PROMPTS;
	return names.map((name) => {
		const found = PROMPTS.find((p) => p.name === name);
		if (!found) {
			console.error(
				`Unknown prompt: "${name}". Available: ${PROMPTS.map((p) => p.name).join(', ')}`
			);
			process.exit(1);
		}
		return found;
	});
}
