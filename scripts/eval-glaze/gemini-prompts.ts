import type { GeminiPromptConfig } from './types.ts';

/**
 * Named Gemini prompt variants for extracting a glaze description from a reference image.
 * The description is passed to Replicate as part of the image generation prompt.
 */
export const GEMINI_PROMPTS: GeminiPromptConfig[] = [
	{
		name: 'v1-brief',
		userPrompt:
			'In one sentence, describe the glaze color, surface finish (matte/satin/glossy), and any distinctive character visible in this pottery image. Focus only on features relevant to the glaze itself.'
	},
	{
		name: 'v2-detailed',
		userPrompt: `Analyze this glazed pottery image. Describe the glaze in precise technical terms for use as an image generation instruction.
Cover: exact color name and tone, opacity (transparent/translucent/opaque), surface finish (matte/satin/glossy), any special effects (crystalline, ash, tenmoku, celadon, shino, wood-fired, etc.), how it pools or breaks at edges and recessed areas, and any color variation across the surface.
Write a single dense paragraph — no headings, no lists.`
	},
	{
		name: 'v3-structured',
		userPrompt: `Analyze this glazed pottery image and return a JSON object describing the glaze. Use exactly this shape:
{
  "color": "<primary color and tone>",
  "finish": "<matte | satin | glossy | other>",
  "opacity": "<transparent | translucent | opaque>",
  "effects": "<special effects or 'none', e.g. celadon, crystalline, ash, tenmoku>",
  "poolingBehavior": "<how glaze behaves at edges, curves, recesses>",
  "colorVariation": "<any color shifts across the surface>"
}
Return only the JSON object.`
	}
];

export function getGeminiPrompts(names?: string[]): GeminiPromptConfig[] {
	if (!names || names.length === 0) return GEMINI_PROMPTS;
	return names.map((name) => {
		const found = GEMINI_PROMPTS.find((p) => p.name === name);
		if (!found) {
			console.error(
				`Unknown Gemini prompt: "${name}". Available: ${GEMINI_PROMPTS.map((p) => p.name).join(', ')}`
			);
			process.exit(1);
		}
		return found;
	});
}

/**
 * Convert a structured JSON glaze description (from v3-structured) to a prose string
 * suitable for use in an image generation prompt.
 */
export function serializeStructuredDescription(raw: string): string {
	try {
		const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
		const obj = JSON.parse(cleaned) as Record<string, string>;
		const parts = [
			obj.color && `color: ${obj.color}`,
			obj.finish && `finish: ${obj.finish}`,
			obj.opacity && `opacity: ${obj.opacity}`,
			obj.effects && obj.effects !== 'none' && `effects: ${obj.effects}`,
			obj.poolingBehavior && `pooling: ${obj.poolingBehavior}`,
			obj.colorVariation && `color variation: ${obj.colorVariation}`
		].filter(Boolean);
		return parts.join('; ');
	} catch {
		return raw;
	}
}
