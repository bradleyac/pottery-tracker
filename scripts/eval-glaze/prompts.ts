import type { PromptConfig } from './types.ts';

/**
 * Named prompt variants for the flux-2-dev glaze preview call.
 * All variants pass two images: piece (image 1) and glaze reference (image 2).
 */
export const PROMPTS: PromptConfig[] = [
	{
		name: 'v1-simple',
		prompt: 'Apply the glaze from the second image to the pottery piece in the first image.'
	},
	{
		name: 'v2-preserve',
		prompt:
			'Apply the glaze from the second image to the pottery piece in the first image. Preserve the exact shape, proportions, surface texture, and any decorative elements of the piece — only the surface color and finish should change.'
	},
	{
		name: 'v3-stages',
		prompt:
			'The first image shows an unglazed pottery piece. The second image shows a glazed pottery piece with a specific glaze finish. Transform the first piece so it appears glazed with the same glaze as shown in the second image. Keep the shape, size, and all physical features of the first piece identical.'
	},
	{
		name: 'v4-style',
		prompt:
			'Using the second image as a glaze style reference, show what the pottery piece from the first image would look like after being dipped in and fired with that glaze. Maintain the original piece\'s form exactly.'
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
