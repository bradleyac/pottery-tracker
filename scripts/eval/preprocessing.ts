import sharp from 'sharp';
import type { PreprocessingStage, PreprocessingPipeline } from './types.ts';

// ── Built-in stages ─────────────────────────────────────────────────────────

const STAGES: Record<string, PreprocessingStage> = {
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
	buildPipeline('baseline', ['resize512']),
	buildPipeline('grayscale', ['resize512', 'grayscale']),
	buildPipeline('normalized', ['resize512', 'normalize']),
	buildPipeline('gray-norm', ['resize512', 'grayscale', 'normalize']),
	buildPipeline('clahe', ['resize512', 'clahe']),
	buildPipeline('gray-clahe', ['resize512', 'grayscale', 'clahe'])
];
