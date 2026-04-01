import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import type { ClaudeMatchResult } from '$lib/types';
import { env } from '$env/dynamic/private';

const MATCH_MODEL = 'gemini-2.5-flash';
const DESCRIBE_MODEL = 'gemini-2.5-flash';

function getClient() {
	return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

const MATCH_SYSTEM_PROMPT = `You are an expert pottery analyst helping potters track their ceramic pieces over time.
Your task is to determine whether a new photo shows an existing piece or a new one.

You will be given the new photo alongside reference photos of candidate pieces from the potter's collection.
COMPARE THE PHOTOS VISUALLY — this is the primary way to determine matches.

IMPORTANT: Pottery changes appearance dramatically across stages:
- Greenware (raw clay) → Bisqueware → Glazed/Fired
- COLOR, SURFACE FINISH, and TEXTURE will change completely between stages
- SHAPE, FORM, PROPORTIONS, and STRUCTURAL FEATURES persist across stages

When comparing photos, focus on:
- Overall shape and silhouette — does the profile match?
- Proportions (height-to-width ratio, wall angles, depth)
- Rim shape, foot ring, and base
- Handles, spouts, knobs, lugs — count and placement
- Distinctive imperfections: wobbles, asymmetries, lopsided walls
- Decorative patterns: carved, incised, or stamped elements

IGNORE differences in color, surface finish, and texture — these change across stages.
Two photos showing the same shape in different colors/finishes IS a match.

CRITICAL — AVOID FALSE POSITIVES:
- Potters routinely make multiple similar pieces in the same session. Visual similarity alone is NOT enough to confirm a match.
- A match requires identifying specific, distinguishing features present in BOTH photos — an asymmetry, a particular wobble, a distinctive rim shape, a unique proportion. Generic shared form (e.g. "both are flat plates") is not a match.
- If the photos are taken from very different angles (e.g. side view vs. top-down), key proportions may be obscured — lower your confidence accordingly.
- When in doubt, return null. A missed match is easily corrected by the user; a false match corrupts their records.

Each candidate also has a text identity card as supplementary context for features that
may not be visible in the reference photo angle.

Return this exact JSON structure:
{
  "matchedPieceId": "<uuid string or null if no match>",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation citing the specific distinguishing features that confirm or rule out a match>",
  "suggestedName": "<suggested name if new piece, empty string if matched>",
  "updatedDescription": "<brief text description of the piece's key physical features>"
}

Rules:
- Set matchedPieceId to null when confidence < 0.70 (treat as new piece)
- Confidence 0.70-0.84: possible match, note uncertainty in reasoning
- Confidence 0.85+: confident match`;

export type ExistingPiece = {
	id: string;
	name: string;
	ai_description: string | null;
	cover_storage_path?: string | null;
	coverImageBase64?: string | null;
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
	candidates: ExistingPiece[]
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

	const { data: base64Image, mimeType } = await resizeForApi(imageBuffer);

	// Build multi-image parts: new photo + candidate photos with identity cards
	const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
		{ text: 'Here is the NEW pottery photo to identify:' },
		{ inlineData: { mimeType, data: base64Image } },
		{ text: '\nHere are the candidate pieces from this potter\'s collection. Compare the new photo visually against each candidate\'s reference photo:\n' }
	];

	for (let i = 0; i < candidates.length; i++) {
		const p = candidates[i];
		parts.push({ text: `\n--- Candidate ${i + 1} ---\nID: ${p.id}\nName: ${p.name}` });

		if (p.coverImageBase64) {
			parts.push({ text: 'Reference photo:' });
			parts.push({ inlineData: { mimeType: 'image/jpeg', data: p.coverImageBase64 } });
		}

		if (p.ai_description) {
			let formattedDesc: string;
			try {
				const parsed = JSON.parse(p.ai_description);
				formattedDesc = JSON.stringify(parsed, null, 2);
			} catch {
				formattedDesc = p.ai_description;
			}
			parts.push({ text: `Identity Card (supplementary):\n${formattedDesc}` });
		}
	}

	parts.push({ text: '\nDoes the new photo match any candidate? Compare shapes, proportions, and structural features visually. Ignore color/finish differences. Return only JSON.' });

	const response = await getClient().models.generateContent({
		model: MATCH_MODEL,
		config: {
			systemInstruction: MATCH_SYSTEM_PROMPT,
			responseMimeType: 'application/json'
		},
		contents: [{ role: 'user', parts }]
	});

	const text = response.text ?? '';
	const result = parseResponseJson(text);

	// Validate matchedPieceId is actually in our list
	if (result.matchedPieceId) {
		const exists = candidates.some((p) => p.id === result.matchedPieceId);
		if (!exists) {
			result.matchedPieceId = null;
			result.confidence = 0;
		}
	}

	return result;
}

const DESCRIBE_SYSTEM_PROMPT = `You are an expert pottery analyst. Describe this pottery piece's key physical features
in a brief text summary. This description serves as supplementary context alongside photos for matching.

Focus on PERSISTENT features that survive across pottery stages (greenware → bisque → glazed → fired):
- Form type (bowl, mug, plate, vase, etc.) and proportions
- Rim style, foot ring, handles, spouts
- Distinctive marks, imperfections, decorative elements

NEVER mention color, surface finish, glaze, or clay body appearance.
Only describe features visible in the photo.

Return a JSON object:
{
  "form": "<form type and brief shape description>",
  "keyFeatures": "<2-3 sentences describing the most distinctive physical features>",
  "handles": { "count": <number>, "style": "<description if any>" }
}`;

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

function parseResponseJson(text: string): ClaudeMatchResult {
	const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

	try {
		const parsed = JSON.parse(cleaned);
		// updatedDescription may be a JSON object (structured identity card) or a string
		let updatedDescription = parsed.updatedDescription ?? '';
		if (typeof updatedDescription === 'object' && updatedDescription !== null) {
			updatedDescription = JSON.stringify(updatedDescription);
		}
		return {
			matchedPieceId: parsed.matchedPieceId ?? null,
			confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
			reasoning: parsed.reasoning ?? '',
			suggestedName: parsed.suggestedName ?? '',
			updatedDescription
		};
	} catch {
		return {
			matchedPieceId: null,
			confidence: 0,
			reasoning: 'Failed to parse model response',
			suggestedName: 'New Piece',
			updatedDescription: ''
		};
	}
}
