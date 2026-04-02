import { generateDepthMap } from './depth';
import { resizeForApi } from './claude';
import { downloadImage } from './storage';
import {
	MATCH_SYSTEM_PROMPT,
	THUMBNAIL_MATCH_SYSTEM_PROMPT,
	buildMatchingParts,
	buildThumbnailMatchingParts,
	type MatchCandidate,
	type GeminiPart
} from '../../../supabase/functions/_shared/matching.js';

export type RawCandidate = {
	id: string;
	name: string;
	ai_description: string | null;
	coverPath: string | null;
};

export interface MatchingStrategy {
	readonly name: string;
	readonly systemPrompt: string;
	prepareNewImage(buffer: Buffer): Promise<{ base64: string; depthBase64: string | null }>;
	fetchCandidateImages(candidates: RawCandidate[]): Promise<MatchCandidate[]>;
	buildParts(newBase64: string, newDepthBase64: string | null, candidates: MatchCandidate[]): GeminiPart[];
}

class DepthMapStrategy implements MatchingStrategy {
	readonly name = 'depth-map';
	readonly systemPrompt = MATCH_SYSTEM_PROMPT;

	async prepareNewImage(buffer: Buffer): Promise<{ base64: string; depthBase64: string | null }> {
		const { data: base64 } = await resizeForApi(buffer);
		let depthBase64: string | null = null;
		try {
			const depthBuffer = await generateDepthMap(buffer);
			depthBase64 = depthBuffer.toString('base64');
		} catch (err) {
			console.error('[match] depth map generation failed, falling back to RGB:', err);
		}
		return { base64, depthBase64 };
	}

	async fetchCandidateImages(candidates: RawCandidate[]): Promise<MatchCandidate[]> {
		return Promise.all(
			candidates.map(async (c) => {
				let imageBase64: string | null = null;
				if (c.coverPath) {
					try {
						const depthPath = c.coverPath.replace(/\/([^/]+)\.jpg$/, '/depth_$1.jpg');
						const depthBuffer = await downloadImage(depthPath);
						imageBase64 = depthBuffer.toString('base64');
					} catch {
						// No depth map — fall back to thumbnail
					}
					if (!imageBase64) {
						try {
							const thumbPath = c.coverPath.replace(/\/([^/]+)\.jpg$/, '/thumb_$1.jpg');
							const thumbBuffer = await downloadImage(thumbPath);
							imageBase64 = thumbBuffer.toString('base64');
						} catch {
							try {
								const fullBuffer = await downloadImage(c.coverPath);
								const { data } = await resizeForApi(fullBuffer);
								imageBase64 = data;
							} catch {
								// Skip this candidate's image
							}
						}
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

	async prepareNewImage(buffer: Buffer): Promise<{ base64: string; depthBase64: string | null }> {
		const { data: base64 } = await resizeForApi(buffer);
		return { base64, depthBase64: null };
	}

	async fetchCandidateImages(candidates: RawCandidate[]): Promise<MatchCandidate[]> {
		return Promise.all(
			candidates.map(async (c) => {
				let imageBase64: string | null = null;
				if (c.coverPath) {
					try {
						const thumbPath = c.coverPath.replace(/\/([^/]+)\.jpg$/, '/thumb_$1.jpg');
						const thumbBuffer = await downloadImage(thumbPath);
						imageBase64 = thumbBuffer.toString('base64');
					} catch {
						try {
							const fullBuffer = await downloadImage(c.coverPath);
							const { data } = await resizeForApi(fullBuffer);
							imageBase64 = data;
						} catch {
							// Skip this candidate's image
						}
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

export function getMatchingStrategy(): MatchingStrategy {
	const name = process.env.MATCHING_STRATEGY ?? 'thumbnail';
	return name === 'depth-map' ? new DepthMapStrategy() : new ThumbnailStrategy();
}
