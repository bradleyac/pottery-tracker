import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import type { ClaudeMatchResult } from '$lib/types';
import { env } from '$env/dynamic/private';
import {
	DESCRIBE_SYSTEM_PROMPT,
	BOUNDS_PROMPT,
	parseResponseJson,
	parseBoundsResponse
} from '../../../supabase/functions/_shared/matching.js';
import type { MatchingStrategy } from './strategies';
import type { RawCandidate } from './strategies';

const MATCH_MODEL = 'gemini-2.5-flash';
const DESCRIBE_MODEL = 'gemini-2.5-flash';

function getClient() {
	return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

// ExistingPiece: used by getExistingPiecesForMatching / getPieceCoverUrls (non-matching contexts)
export type ExistingPiece = {
	id: string;
	name: string;
	ai_description: string | null;
	cover_storage_path?: string | null;
};

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const EMBEDDING_MODEL = 'gemini-embedding-2-preview';

// Resize to at most 512px on the longest side before sending to the model.
// Originals are stored at full resolution; only the API payload is shrunk.
export async function resizeForApi(buffer: Buffer): Promise<{ data: string; mimeType: 'image/jpeg' }> {
	const resized = await sharp(buffer)
		.resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 82 })
		.toBuffer();
	return { data: resized.toString('base64'), mimeType: 'image/jpeg' };
}

export async function generateImageEmbedding(imageBuffer: Buffer): Promise<number[]> {
	const { data, mimeType } = await resizeForApi(imageBuffer);

	const response = await getClient().models.embedContent({
		model: EMBEDDING_MODEL,
		contents: [{ parts: [{ inlineData: { mimeType, data } }] }],
		config: { outputDimensionality: 768 }
	});

	const embedding = response.embeddings?.[0]?.values;
	if (!embedding) throw new Error('Failed to generate image embedding');
	return embedding;
}

export async function matchImageToPieces(
	imageBuffer: Buffer,
	mediaType: ImageMediaType,
	rawCandidates: RawCandidate[],
	strategy: MatchingStrategy
): Promise<ClaudeMatchResult> {
	// No candidates → skip matching, just describe
	if (rawCandidates.length === 0) {
		const description = await describeNewPiece(imageBuffer, mediaType);
		return {
			matchedPieceId: null,
			confidence: 0,
			reasoning: 'No candidate pieces to match against.',
			suggestedName: 'New Piece',
			updatedDescription: description
		};
	}

	const { data: resizedBase64 } = await resizeForApi(imageBuffer);
	const { base64: newBase64, depthBase64: newDepthBase64 } = await strategy.prepareNewImage(resizedBase64);
	const candidates = await strategy.fetchCandidateImages(rawCandidates);
	const parts = strategy.buildParts(newBase64, newDepthBase64, candidates);

	console.log('[match] sending to Gemini:', {
		strategy: strategy.name,
		candidates: candidates.map((c) => ({ id: c.id, name: c.name, hasImage: !!c.imageBase64 })),
		hasNewDepthMap: !!newDepthBase64,
		totalParts: parts.length
	});

	const response = await getClient().models.generateContent({
		model: MATCH_MODEL,
		config: {
			systemInstruction: strategy.systemPrompt,
			responseMimeType: 'application/json'
		},
		contents: [{ role: 'user', parts }]
	});

	const text = response.text ?? '';
	console.log('[match] Gemini raw response:', text.slice(0, 1000));

	const result = parseResponseJson(text);
	console.log('[match] parsed result:', { matchedPieceId: result.matchedPieceId, confidence: result.confidence });

	// Validate matchedPieceId is actually in our list
	if (result.matchedPieceId) {
		const exists = rawCandidates.some((c) => c.id === result.matchedPieceId);
		if (!exists) {
			console.error('[match] matchedPieceId not in candidate list — nulling');
			result.matchedPieceId = null;
			result.confidence = 0;
		}
	}

	return result;
}

export async function detectPieceBounds(
	imageBuffer: Buffer
): Promise<{ x1: number; y1: number; x2: number; y2: number } | null> {
	const { data: base64Image, mimeType } = await resizeForApi(imageBuffer);

	const response = await getClient().models.generateContent({
		model: DESCRIBE_MODEL,
		config: { responseMimeType: 'application/json' },
		contents: [
			{
				role: 'user',
				parts: [
					{ inlineData: { mimeType, data: base64Image } },
					{ text: BOUNDS_PROMPT }
				]
			}
		]
	});

	return parseBoundsResponse(response.text ?? '');
}

export async function describeNewPiece(
	imageBuffer: Buffer,
	_mediaType?: ImageMediaType
): Promise<string> {
	const { data: base64Image, mimeType } = await resizeForApi(imageBuffer);

	const response = await getClient().models.generateContent({
		model: DESCRIBE_MODEL,
		config: {
			systemInstruction: DESCRIBE_SYSTEM_PROMPT,
			responseMimeType: 'application/json'
		},
		contents: [
			{
				role: 'user',
				parts: [
					{ inlineData: { mimeType, data: base64Image } },
					{
						text: 'Create a structured identity card for this pottery piece. Return only the JSON object.'
					}
				]
			}
		]
	});

	const text = response.text ?? '{}';
	// Validate it's parseable JSON, then store as string
	try {
		const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
		JSON.parse(cleaned);
		return cleaned;
	} catch {
		return text;
	}
}
