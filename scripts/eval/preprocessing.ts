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
	buildPipeline('gray-clahe1024', ['resize1024', 'grayscale', 'clahe'])
];
