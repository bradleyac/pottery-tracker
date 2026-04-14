import sharp from 'sharp';
import type { PreprocessingPipeline, PreprocessingStage } from './types.ts';

// ── Built-in stages ─────────────────────────────────────────────────────────

const STAGES: Record<string, PreprocessingStage> = {
	resize1024: {
		name: 'resize1024',
		async process(buf) {
			return sharp(buf)
				.rotate()
				.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
				.jpeg({ quality: 82 })
				.toBuffer();
		}
	},
	resize768: {
		name: 'resize768',
		async process(buf) {
			return sharp(buf)
				.rotate()
				.resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
				.jpeg({ quality: 82 })
				.toBuffer();
		}
	},
	resize512: {
		name: 'resize512',
		async process(buf) {
			return sharp(buf)
				.rotate()
				.resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
				.jpeg({ quality: 82 })
				.toBuffer();
		}
	},

	// ── Square-padded resizes ─────────────────────────────────────────────────
	// Use `fit: 'contain'` so the output is always exactly NxN, with the short
	// edge padded out to white. Pairs well with `bbox-crop` (and therefore with
	// --bg-remove): the piece is first tightened to its bounding box, then the
	// padding normalises aspect ratio so the same piece shot at different
	// zoom/framing lands in the same region of the embedding input.
	square1024: {
		name: 'square1024',
		async process(buf) {
			return sharp(buf)
				.rotate()
				.resize({
					width: 1024,
					height: 1024,
					fit: 'contain',
					background: { r: 255, g: 255, b: 255 },
					withoutEnlargement: true
				})
				.flatten({ background: { r: 255, g: 255, b: 255 } })
				.jpeg({ quality: 82 })
				.toBuffer();
		}
	},
	square768: {
		name: 'square768',
		async process(buf) {
			return sharp(buf)
				.rotate()
				.resize({
					width: 768,
					height: 768,
					fit: 'contain',
					background: { r: 255, g: 255, b: 255 },
					withoutEnlargement: true
				})
				.flatten({ background: { r: 255, g: 255, b: 255 } })
				.jpeg({ quality: 82 })
				.toBuffer();
		}
	},
	square512: {
		name: 'square512',
		async process(buf) {
			return sharp(buf)
				.rotate()
				.resize({
					width: 512,
					height: 512,
					fit: 'contain',
					background: { r: 255, g: 255, b: 255 },
					withoutEnlargement: true
				})
				.flatten({ background: { r: 255, g: 255, b: 255 } })
				.jpeg({ quality: 82 })
				.toBuffer();
		}
	},

	// ── Bounding-box crop ─────────────────────────────────────────────────────
	// Trims edge pixels that are close to the top-left sample colour. On
	// bg-removed images (which `bgremove.ts` flattens to white) this tightens
	// the frame to the piece itself, normalising object scale across shots
	// taken at very different zoom/framing. On raw photos the behaviour
	// depends on the top-left pixel of the backdrop, so this stage is intended
	// to run under --bg-remove.
	'bbox-crop': {
		name: 'bbox-crop',
		async process(buf) {
			return sharp(buf)
				.rotate()
				.trim({ background: { r: 255, g: 255, b: 255 }, threshold: 15 })
				.toBuffer();
		}
	},

	grayscale: {
		name: 'grayscale',
		async process(buf) {
			return sharp(buf).grayscale().toBuffer();
		}
	},

	normalize: {
		name: 'normalize',
		async process(buf) {
			return sharp(buf).normalize().toBuffer();
		}
	},

	clahe: {
		name: 'clahe',
		async process(buf) {
			return sharp(buf).clahe({ width: 8, height: 8 }).toBuffer();
		}
	},

	sharpen: {
		name: 'sharpen',
		async process(buf) {
			return sharp(buf).sharpen().toBuffer();
		}
	}
};

// ── Pipeline composition ────────────────────────────────────────────────────

export function buildPipeline(name: string, stageNames: string[]): PreprocessingPipeline {
	const stages = stageNames.map((s) => {
		const stage = STAGES[s];
		if (!stage) throw new Error(`Unknown preprocessing stage: "${s}". Available: ${Object.keys(STAGES).join(', ')}`);
		return stage;
	});
	return { name, stages };
}

export async function runPipeline(pipeline: PreprocessingPipeline, buffer: Buffer): Promise<Buffer> {
	let result = buffer;
	for (const stage of pipeline.stages) {
		result = await stage.process(result);
	}
	return result;
}

// ── Default pipelines ───────────────────────────────────────────────────────

export const DEFAULT_PIPELINES: PreprocessingPipeline[] = [
	buildPipeline('baseline512', ['resize512']),
	buildPipeline('grayscale512', ['resize512', 'grayscale']),
	buildPipeline('normalized512', ['resize512', 'normalize']),
	buildPipeline('gray-norm512', ['resize512', 'grayscale', 'normalize']),
	buildPipeline('clahe512', ['resize512', 'clahe']),
	buildPipeline('gray-clahe512', ['resize512', 'grayscale', 'clahe']),

	buildPipeline('baseline768', ['resize768']),
	buildPipeline('grayscale768', ['resize768', 'grayscale']),
	buildPipeline('normalized768', ['resize768', 'normalize']),
	buildPipeline('gray-norm768', ['resize768', 'grayscale', 'normalize']),
	buildPipeline('clahe768', ['resize768', 'clahe']),
	buildPipeline('gray-clahe768', ['resize768', 'grayscale', 'clahe']),

	buildPipeline('baseline1024', ['resize1024']),
	buildPipeline('grayscale1024', ['resize1024', 'grayscale']),
	buildPipeline('normalized1024', ['resize1024', 'normalize']),
	buildPipeline('gray-norm1024', ['resize1024', 'grayscale', 'normalize']),
	buildPipeline('clahe1024', ['resize1024', 'clahe']),
	buildPipeline('gray-clahe1024', ['resize1024', 'grayscale', 'clahe']),

	// Square-padded variants — always produce NxN output with white pad.
	buildPipeline('square512', ['square512']),
	buildPipeline('square768', ['square768']),
	buildPipeline('square1024', ['square1024']),

	// Bounding-box crop then square pad — pairs with --bg-remove to normalise
	// object scale as well as aspect ratio.
	buildPipeline('bbox-square512', ['bbox-crop', 'square512']),
	buildPipeline('bbox-square768', ['bbox-crop', 'square768']),
	buildPipeline('bbox-square1024', ['bbox-crop', 'square1024']),

	buildPipeline('bbox-square512+gs+norm', ['bbox-crop', 'square512', 'grayscale', 'normalize']),
	buildPipeline('bbox-square1024+gs+norm', ['bbox-crop', 'square1024', 'grayscale', 'normalize']),
	buildPipeline('bbox-square512+gs+clahe', ['bbox-crop', 'square512', 'grayscale', 'clahe']),
	buildPipeline('bbox-square1024+gs+clahe', ['bbox-crop', 'square1024', 'grayscale', 'clahe']),

	buildPipeline('bbox512', ['bbox-crop', 'resize512']),
	buildPipeline('bbox1024', ['bbox-crop', 'resize1024']),

	buildPipeline('bbox-gray-clahe512', ['bbox-crop', 'resize512', 'grayscale', 'clahe']),
];

// Pipeline                      Embedder     R@1     R@3     R@5     R@8     MRR     
// ───────────────────────────────────────────────────────────────────────────────────
// gray-norm512+bgr              gemini-768d  0.39    0.78    0.86    0.97    0.89    
// gray-clahe512+bgr             gemini-768d  0.48    0.84    0.88    0.95    0.96  