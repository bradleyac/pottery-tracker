import type { PromptConfig } from './types.ts';

/**
 * Named prompt variants for the flux-2-dev glaze preview call.
 * All variants pass two images: piece (image 1) and glaze reference (image 2).
 */
export const PROMPTS: PromptConfig[] = [
	{
		name: 'v7-swatch',
		prompt:
			'The first image is the pottery piece to transform. The second image is a glaze color swatch — not a pottery piece, just a color and finish reference. Apply the exact color, opacity, and surface sheen from the swatch to every surface of the first piece. Apply it evenly — no pooling, no drips, no accumulation in crevices. Do not modify the first piece\'s shape, holes, cutouts, carving, or surface decoration in any way.'
	},
	{
		name: 'v8-recolor',
		prompt:
			'Recolor the pottery piece in the first image. Use the second image only to extract the target glaze color, tone, and glossiness — ignore everything else about it. Match the hue, saturation, and surface finish precisely and apply it uniformly across the piece. The first piece\'s form — including any holes, openings, carving, and surface texture — must remain pixel-perfect unchanged. No pooling, drips, or uneven glaze buildup.'
	},
	{
		name: 'v9-prohibition-first',
		prompt:
			'Do not change the shape, holes, cutouts, carving, texture, or any physical feature of the pottery piece in the first image. Do not copy any feature from the second image except its glaze color and surface finish. Apply that color evenly and uniformly — no pooling or drips. The only difference between the input and output should be the surface color and glossiness.'
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
