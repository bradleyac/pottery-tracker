import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import type { ClaudeMatchResult } from '$lib/types';
import { env } from '$env/dynamic/private';
import {
	MATCH_SYSTEM_PROMPT,
	DESCRIBE_SYSTEM_PROMPT,
	BOUNDS_PROMPT,
	parseResponseJson,
	parseBoundsResponse,
	buildMatchingParts
} from '../../../supabase/functions/_shared/matching.js';

const MATCH_MODEL = 'gemini-2.5-flash';
const DESCRIBE_MODEL = 'gemini-2.5-flash';

function getClient() {
	return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

export type ExistingPiece = {
	id: string;
	name: string;
	ai_description: string | null;
	cover_storage_path?: string | null;
	coverImageBase64?: string | null;
	depthMapBase64?: string | null;
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
	candidates: ExistingPiece[],
	depthMapBuffer?: Buffer | null
): Promise<ClaudeMatchResult> {
	// No candidates → skip matching, just describe
	if (candidates.length === 0) {
		const description = await describeNewPiece(imageBuffer, mediaType);
		return {
			matchedPieceId: null,
			confidence: 0,
			reasoning: 'No candidate pieces to match against.',
			suggestedName: 'New Piece',
			updatedDescription: description
		};
	}

	const { data: base64Image } = await resizeForApi(imageBuffer);

	const parts = buildMatchingParts(
		base64Image,
		depthMapBuffer ? depthMapBuffer.toString('base64') : null,
		candidates.map((p) => ({
			id: p.id,
			name: p.name,
			ai_description: p.ai_description,
			depthBase64: p.depthMapBase64 ?? null,
			coverBase64: p.coverImageBase64 ?? null
		}))
	);

	console.log('[match] sending to Gemini:', {
		candidates: candidates.map((p) => ({
			id: p.id,
			name: p.name,
			hasDepthMap: !!p.depthMapBase64,
			hasThumbnail: !!p.coverImageBase64
		})),
		newImageDepthMap: !!depthMapBuffer,
		totalParts: parts.length
	});

	const response = await getClient().models.generateContent({
		model: MATCH_MODEL,
		config: {
			systemInstruction: MATCH_SYSTEM_PROMPT,
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
		const exists = candidates.some((p) => p.id === result.matchedPieceId);
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
