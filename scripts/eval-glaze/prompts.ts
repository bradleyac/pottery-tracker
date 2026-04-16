import type { PromptConfig } from './types.ts';

/**
 * Named prompt variants for the flux-2-dev glaze preview call.
 * All variants pass two images: piece (image 1) and glaze reference (image 2).
 */
export const PROMPTS: PromptConfig[] = [
	{
		name: 'v13-detailed-instructions',
		prompt: `When an unfired pottery piece is glazed and then fired, it changes in the following ways: 
		Color - The piece takes on the color of the glaze, which can vary based on thickness of application; 
		Sheen - The piece becomes shiny, because it has been covered in a ~1mm layer of glass; 
		Surface Texture - The piece becomes smoother compared to the rough texture of unfired or bisque-fired clay, because it has been covered in a ~1mm layer of glass. 
		
		A layer of glaze will NOT change the contours of a piece:
		Any visible contours of the unfired piece on a scale greater than ~1mm WILL remain visible after glazing. 
		The glaze will only add a thin layer of glass on top of the piece, which can change the color, sheen, and surface texture, but NOT the contours of the piece itself.

		A layer of glaze will NOT remove features from a piece:
		Assume that the features of the unfired piece are permanent and will not be removed by the glaze. Only the color, sheen, and surface texture of the glaze itself.

		A layer of glaze will NOT change the nature of decorations or lack thereof on the piece: 
		If copying a glaze from a piece with holes in it, copying the glaze should not copy the holes, only the color, sheen, and surface texture of the glaze itself. 

		A layer of glaze will NOT change the form of the piece: 
		If copying a glaze from a bowl onto a candle-holder, the candle-holder should not end up looking like a bowl--it should keep its form and overall shape and only change the color, sheen and surface texture of the glaze itself. 
		
		The first image is an unfired pottery piece. The second image is a glazed pottery piece. 
		Your task, in order to generate a preview image of the first piece with the glaze applied from the second, is to apply the glaze from the second image to the pottery piece in the first image, WITHOUT transferring any decorations. 
		The transferred glaze MUST be applied evenly across the surface of the piece WITHOUT any pooling, dripping, or ripples.`
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
