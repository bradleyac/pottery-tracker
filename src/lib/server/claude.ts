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

You will be given the new photo and, alongside each candidate, a DEPTH MAP. Depth maps encode 3D surface geometry: brighter pixels are closer to the camera, darker pixels are further away. The gradient patterns directly reveal surface profile shapes — slopes, curves, ridges, and the cross-section of structural elements like rims and rings.

STEP 1 — COMPARE DEPTH MAPS. For each candidate, compare the depth map of the new photo against the candidate's depth map:
- What is the profile shape of the outer rim? (flat, upturned, drooping — look at the gradient at the edge)
- What is the profile of the center ring or boss? (flat-topped, domed, flared outward, cylindrical — look at the highlight shape on top of the ring)
- How does the main surface transition? (flat, gently concave, steeply concave — look at the gradient between rim and center)
- Are there any steps, ridges, or abrupt transitions?

A flat-topped ring shows a uniform bright plateau. A domed ring shows a rounded bright highlight fading to the sides. A flared ring shows a bright edge that curves outward. These are visually distinct in a depth map.

STEP 2 — If any structural element has a clearly different depth profile between the new photo and a candidate, they are DIFFERENT PIECES. Return null for that candidate.

STEP 3 — Only if depth profiles match, look for a specific distinguishing quirk that confirms it is the exact same object (an asymmetry, off-center element, irregularity at a specific location visible in the depth map or RGB photo).

The following are NOT distinguishing features and MUST NOT be cited as match evidence:
- Throwing rings or wheel marks
- Circular or round shape
- The mere presence of a rim, center ring, or any element that defines the form type
- Color, clay body, or surface finish

---

Respond with this JSON structure:

{
  "matchedPieceId": "<uuid or null>",
  "confidence": <0.0–1.0>,
  "depth_comparison": "<describe what the depth maps reveal about the profile shapes of each structural element, and whether they match>",
  "distinguishing_feature": "<a specific quirk visible in both photos confirming same object, OR 'consistent overall' if profiles and decoration match with no contradicting evidence, OR 'profile mismatch' if depth profiles differ>",
  "reasoning": "<cite specific depth map observations; if profiles differ or no distinguishing feature was found, say so explicitly>",
  "suggestedName": "<name if new piece, empty string if matched>",
  "updatedDescription": "<brief description of the piece's key physical features>"
}

Rules:
- If distinguishing_feature is 'profile mismatch', matchedPieceId MUST be null
- Set matchedPieceId to null when confidence < 0.70
- Confidence 0.70–0.84: possible match with noted uncertainty
- Confidence 0.85+: strong match — depth profiles consistent AND overall form/decoration consistent with no contradicting evidence`;

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

	const { data: base64Image, mimeType } = await resizeForApi(imageBuffer);

	const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
		{ text: 'Here is the NEW pottery photo:' },
		{ inlineData: { mimeType, data: base64Image } }
	];

	if (depthMapBuffer) {
		parts.push({ text: 'Depth map of the new photo (brighter = closer to camera):' });
		parts.push({ inlineData: { mimeType: 'image/jpeg', data: depthMapBuffer.toString('base64') } });
	}

	parts.push({ text: '\nCompare the new photo against each candidate using depth maps to assess 3D profile shapes:\n' });

	for (let i = 0; i < candidates.length; i++) {
		const p = candidates[i];
		parts.push({ text: `\n--- Candidate ${i + 1} ---\nID: ${p.id}\nName: ${p.name}` });

		if (p.depthMapBase64) {
			parts.push({ text: 'Depth map (brighter = closer to camera):' });
			parts.push({ inlineData: { mimeType: 'image/jpeg', data: p.depthMapBase64 } });
		} else if (p.coverImageBase64) {
			parts.push({ text: 'Reference photo (no depth map available):' });
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

	parts.push({ text: '\nReturn only JSON.' });

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
	console.log('[match] Gemini raw response:', text.slice(0, 500));

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

export async function detectPieceBounds(
	imageBuffer: Buffer
): Promise<{ x1: number; y1: number; x2: number; y2: number } | null> {
	const { data: base64Image, mimeType } = await resizeForApi(imageBuffer);

	const response = await getClient().models.generateContent({
		model: DESCRIBE_MODEL,
		config: {
			responseMimeType: 'application/json'
		},
		contents: [
			{
				role: 'user',
				parts: [
					{ inlineData: { mimeType, data: base64Image } },
					{
						text: 'Find the main pottery piece in this image. Return a JSON object with its bounding box as fractions of image dimensions (0 to 1): {"x1": <left>, "y1": <top>, "x2": <right>, "y2": <bottom>}. If no pottery piece is clearly visible, return {"x1": 0, "y1": 0, "x2": 1, "y2": 1}.'
					}
				]
			}
		]
	});

	try {
		const text = response.text ?? '';
		const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
		const b = JSON.parse(cleaned);
		if (
			typeof b.x1 === 'number' &&
			typeof b.y1 === 'number' &&
			typeof b.x2 === 'number' &&
			typeof b.y2 === 'number'
		) {
			return {
				x1: Math.max(0, b.x1),
				y1: Math.max(0, b.y1),
				x2: Math.min(1, b.x2),
				y2: Math.min(1, b.y2)
			};
		}
	} catch {
		// Fall through
	}
	return null;
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

function parseResponseJson(text: string): ClaudeMatchResult {
	const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

	try {
		const parsed = JSON.parse(cleaned);
		// updatedDescription may be a JSON object (structured identity card) or a string
		let updatedDescription = parsed.updatedDescription ?? '';
		if (typeof updatedDescription === 'object' && updatedDescription !== null) {
			updatedDescription = JSON.stringify(updatedDescription);
		}
		// Hard-enforce profile mismatch rule
		const profileMismatch =
			typeof parsed.distinguishing_feature === 'string' &&
			parsed.distinguishing_feature.toLowerCase().includes('profile mismatch');
		const matchedPieceId = profileMismatch ? null : (parsed.matchedPieceId ?? null);
		const confidence = profileMismatch ? 0 : (typeof parsed.confidence === 'number' ? parsed.confidence : 0);

		return {
			matchedPieceId,
			confidence,
			reasoning: [parsed.depth_comparison, parsed.distinguishing_feature, parsed.reasoning].filter(Boolean).join(' — '),
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
