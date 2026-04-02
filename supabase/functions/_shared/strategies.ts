// Runtime-agnostic matching strategy logic.
// Imported by both the SvelteKit server (Node.js) and the Supabase edge function (Deno).
// No runtime-specific imports — IO operations are injected via StrategyIO.

import {
	MATCH_SYSTEM_PROMPT,
	THUMBNAIL_MATCH_SYSTEM_PROMPT,
	buildMatchingParts,
	buildThumbnailMatchingParts,
	type GeminiPart,
	type MatchCandidate
} from './matching.ts';

export interface StrategyIO {
	/** Download an image from storage by path. Returns base64, or null on failure. */
	downloadImage(storagePath: string): Promise<string | null>;
	/** Generate a depth map for a base64 image. Returns base64, or null on failure/skip. */
	generateDepthMap(imageBase64: string): Promise<string | null>;
}

export type RawCandidate = {
	id: string;
	name: string;
	ai_description: string | null;
	coverPath: string | null;
};

export interface MatchingStrategy {
	readonly name: string;
	readonly systemPrompt: string;
	prepareNewImage(imageBase64: string): Promise<{ base64: string; depthBase64: string | null }>;
	fetchCandidateImages(candidates: RawCandidate[]): Promise<MatchCandidate[]>;
	buildParts(newBase64: string, newDepthBase64: string | null, candidates: MatchCandidate[]): GeminiPart[];
}

class DepthMapStrategy implements MatchingStrategy {
	readonly name = 'depth-map';
	readonly systemPrompt = MATCH_SYSTEM_PROMPT;

	constructor(private io: StrategyIO) { }

	async prepareNewImage(imageBase64: string): Promise<{ base64: string; depthBase64: string | null }> {
		const depthBase64 = await this.io.generateDepthMap(imageBase64);
		return { base64: imageBase64, depthBase64 };
	}

	async fetchCandidateImages(candidates: RawCandidate[]): Promise<MatchCandidate[]> {
		return Promise.all(
			candidates.map(async (c) => {
				let imageBase64: string | null = null;
				if (c.coverPath) {
					const depthPath = c.coverPath.replace(/\/([^/]+)\.jpg$/, '/depth_$1.jpg');
					imageBase64 = await this.io.downloadImage(depthPath);
					if (!imageBase64) {
						const thumbPath = c.coverPath.replace(/\/([^/]+)\.jpg$/, '/thumb_$1.jpg');
						imageBase64 = await this.io.downloadImage(thumbPath);
					}
					if (!imageBase64) {
						imageBase64 = await this.io.downloadImage(c.coverPath);
					}
				}
				return { id: c.id, name: c.name, ai_description: c.ai_description, imageBase64 };
			})
		);
	}

	buildParts(newBase64: string, newDepthBase64: string | null, candidates: MatchCandidate[]): GeminiPart[] {
		return buildMatchingParts(newBase64, newDepthBase64, candidates);
	}
}

class ThumbnailStrategy implements MatchingStrategy {
	readonly name = 'thumbnail';
	readonly systemPrompt = THUMBNAIL_MATCH_SYSTEM_PROMPT;

	constructor(private io: StrategyIO) { }

	async prepareNewImage(imageBase64: string): Promise<{ base64: string; depthBase64: string | null }> {
		return { base64: imageBase64, depthBase64: null };
	}

	async fetchCandidateImages(candidates: RawCandidate[]): Promise<MatchCandidate[]> {
		return Promise.all(
			candidates.map(async (c) => {
				let imageBase64: string | null = null;
				if (c.coverPath) {
					const thumbPath = c.coverPath.replace(/\/([^/]+)\.jpg$/, '/thumb_$1.jpg');
					imageBase64 = await this.io.downloadImage(thumbPath);
					if (!imageBase64) {
						imageBase64 = await this.io.downloadImage(c.coverPath);
					}
				}
				return { id: c.id, name: c.name, ai_description: c.ai_description, imageBase64 };
			})
		);
	}

	buildParts(newBase64: string, _newDepthBase64: string | null, candidates: MatchCandidate[]): GeminiPart[] {
		return buildThumbnailMatchingParts(newBase64, candidates);
	}
}

export function createMatchingStrategy(name: string, io: StrategyIO): MatchingStrategy {
	return name === 'depth-map' ? new DepthMapStrategy(io) : new ThumbnailStrategy(io);
}
