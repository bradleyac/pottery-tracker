import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import type { ClaudeMatchResult } from '$lib/types';
import { env } from '$env/dynamic/private';

const MATCH_MODEL = 'gemini-2.5-flash';
const DESCRIBE_MODEL = 'gemini-2.5-flash';

function getClient() {
	return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

const MATCH_SYSTEM_PROMPT = `You are a pottery analyst. Your job is to determine whether a new photo shows the EXACT SAME PHYSICAL OBJECT as a candidate piece, or a different piece.

IMPORTANT — pottery stages: Greenware → Bisqueware → Glazed/Fired. Color, surface finish, and texture change completely across stages. Shape and structural features persist. Ignore color/finish differences.

---

YOUR TASK IS TO IDENTIFY THE SAME PHYSICAL OBJECT, NOT THE SAME FORM TYPE.

Potters make many pieces of the same form. Two pieces can look nearly identical and still be different objects. Shared form type is EXPECTED and proves nothing.

To confirm a match, you must find a specific physical quirk visible in BOTH photos that would be absent in a typical piece of that form — for example:
- An asymmetry or wobble that is off-center in a specific direction
- A crack, scar, or repair
- An unusual rim irregularity at a specific location
- A handle or knob that is noticeably off-axis
- A foot ring that is distinctly uneven on one side

The following are NOT distinguishing features and MUST NOT be cited as match evidence:
- Throwing rings or wheel marks (present on all wheel-thrown pottery)
- Circular or round shape
- Flat profile, raised center boss, or any feature that defines the form type
- "Identical proportions" or "consistent dimensions" (you cannot measure from photos)
- Color, clay body, or surface finish

If the photos are taken from significantly different angles, you cannot reliably compare proportions — this makes a confident match LESS likely, not more.

---

Respond with this JSON structure:

{
  "matchedPieceId": "<uuid or null>",
  "confidence": <0.0–1.0>,
  "distinguishing_feature": "<the single specific physical quirk present in BOTH photos that identifies this as the same object — or 'none found' if you cannot identify one>",
  "reasoning": "<explain what you see in both photos; if no distinguishing feature was found, say so explicitly>",
  "suggestedName": "<name if new piece, empty string if matched>",
  "updatedDescription": "<brief description of the piece's key physical features>"
}

Rules:
- If distinguishing_feature is 'none found', matchedPieceId MUST be null
- Set matchedPieceId to null when confidence < 0.70
- Confidence 0.70–0.84: possible match with noted uncertainty
- Confidence 0.85+: confident match with a clearly visible distinguishing feature`;

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
			reasoning: [parsed.distinguishing_feature, parsed.reasoning].filter(Boolean).join(' — '),
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
