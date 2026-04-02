// Shared matching + bounds-detection logic — pure TypeScript, no Node or Deno APIs.
// Imported by both the SvelteKit server (src/lib/server/claude.ts) and the
// Supabase edge function (supabase/functions/analyze-pending/index.ts).

export interface BoundingBox {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export const BOUNDS_PROMPT =
	'Find the main pottery piece in this image. Return a JSON object with its bounding box as fractions of image dimensions (0 to 1): {"x1": <left>, "y1": <top>, "x2": <right>, "y2": <bottom>}. If no pottery piece is clearly visible, return {"x1": 0, "y1": 0, "x2": 1, "y2": 1}.';

export function parseBoundsResponse(text: string): BoundingBox | null {
	try {
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

export interface MatchResult {
	matchedPieceId: string | null;
	confidence: number;
	reasoning: string;
	suggestedName: string;
	updatedDescription: string;
}

export interface MatchCandidate {
	id: string;
	name: string;
	ai_description: string | null;
	imageBase64: string | null; // depth map or thumbnail — strategy's choice
}

export type GeminiPart =
	| { text: string }
	| { inlineData: { mimeType: string; data: string } };

export const MATCH_SYSTEM_PROMPT = `You are a pottery analyst. Your job is to determine whether a new photo shows the EXACT SAME PHYSICAL OBJECT as a candidate piece, or a different piece.

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

Respond with a SINGLE JSON object representing your BEST match across all candidates (the one with the highest confidence, or null if none qualify). Do NOT return an array.

{
  "matchedPieceId": "<uuid of best matching candidate, or null>",
  "confidence": <0.0–1.0>,
  "depth_comparison": "<describe what the depth maps reveal about the profile shapes of each structural element, and whether they match>",
  "distinguishing_feature": "<a specific quirk visible in both photos confirming same object, OR 'consistent overall' if profiles and decoration match with no contradicting evidence, OR 'profile mismatch' if depth profiles differ>",
  "reasoning": "<cite specific depth map observations; if profiles differ or no distinguishing feature was found, say so explicitly>",
  "suggestedName": "<name if new piece, empty string if matched>",
  "updatedDescription": "<brief description of the piece's key physical features>"
}

Rules:
- Return ONE object only — your single best match, not one object per candidate
- If distinguishing_feature is 'profile mismatch', matchedPieceId MUST be null
- If distinguishing_feature is 'none found', matchedPieceId MUST be null
- Set matchedPieceId to null when confidence < 0.70
- Confidence 0.70–0.84: possible match with noted uncertainty
- Confidence 0.85+: strong match — depth profiles consistent AND overall form/decoration consistent with no contradicting evidence`;

export const THUMBNAIL_MATCH_SYSTEM_PROMPT = `You are a pottery analyst. Your job is to determine whether a new photo shows the EXACT SAME PHYSICAL OBJECT as a candidate piece, or a different piece.

IMPORTANT — pottery stages: Greenware → Bisqueware → Glazed/Fired. Color, surface finish, and texture change completely across stages. Shape and structural features persist. Ignore color/finish differences.

---

YOUR TASK IS TO IDENTIFY THE SAME PHYSICAL OBJECT, NOT THE SAME FORM TYPE.

Potters make many pieces of the same form. Two pieces can look nearly identical and still be different objects. Shared form type is EXPECTED and proves nothing.

GLAZE EFFECT ON SURFACE DETAIL: When glaze (whether wet/unfired or fired) has been applied to a piece, incised or carved patterns will appear shallower, less crisp, or partially filled in compared to the greenware stage. Do NOT treat reduced pattern depth or indistinct surface texture as evidence of a different piece — this is expected when comparing a glazed photo against a greenware candidate, or vice versa. Additionally, wet or unfired glaze can create transient surface texture artifacts — small circular indentations, bubbles, pinholes, cracks, brush marks, and uneven application texture — that disappear entirely or change significantly after firing. These are NOT permanent features of the piece. Do NOT treat them as distinguishing features or cite them as mismatch evidence.

STEP 1 — COMPARE SHAPES. For each candidate, compare the structural form of the new photo against the candidate:
- What is the overall form type and proportions? (height-to-width ratio, silhouette)
- What is the rim style? (flat, upturned, drooping, flared)
- Are there handles, spouts, or other structural elements? Where are they positioned?
- Are there any distinctive surface decorations, textures, or marks? (account for glaze obscuring incised detail)
- Are there any asymmetries, irregularities, or unique imperfections?

STEP 2 — If any structural element clearly differs between the new photo and a candidate, they are DIFFERENT PIECES. Do not disqualify based on incised patterns appearing less distinct if glaze may have been applied.

STEP 3 — Only if overall shapes are consistent, look for a specific distinguishing quirk that confirms it is the exact same object (an asymmetry, off-center element, irregularity at a specific location).

The following are NOT distinguishing features and MUST NOT be cited as match evidence:
- Throwing rings or wheel marks
- Circular or round shape
- The mere presence of a rim, center ring, or any element that defines the form type
- Color, clay body, or surface finish
- Apparent rim shape being round vs. oval — a circular rim will appear oval when photographed from any angle other than directly overhead; camera angle alone does not change the rim shape
- Transient glaze application artifacts: small circular indentations, bubbles, pinholes, cracks, brush marks, or uneven texture visible on wet/unfired glazed surfaces

---

Respond with a SINGLE JSON object representing your BEST match across all candidates (the one with the highest confidence, or null if none qualify). Do NOT return an array.

{
  "matchedPieceId": "<uuid of best matching candidate, or null>",
  "confidence": <0.0–1.0>,
  "depth_comparison": "<describe how the shape and structural features of the new photo compare to the candidate>",
  "distinguishing_feature": "<a specific quirk visible in both photos confirming same object, OR 'consistent overall' if form and decoration match with no contradicting evidence, OR 'profile mismatch' if structural features differ>",
  "reasoning": "<cite specific visual observations; if features differ or no distinguishing feature was found, say so explicitly>",
  "suggestedName": "<name if new piece, empty string if matched>",
  "updatedDescription": "<brief description of the piece's key physical features>"
}

Rules:
- Return ONE object only — your single best match, not one object per candidate
- If distinguishing_feature is 'profile mismatch', matchedPieceId MUST be null
- If distinguishing_feature is 'none found', matchedPieceId MUST be null
- Set matchedPieceId to null when confidence < 0.70
- Confidence 0.70–0.84: possible match with noted uncertainty
- Confidence 0.85+: strong match — form and decoration consistent with no contradicting evidence`;

export const DESCRIBE_SYSTEM_PROMPT = `You are an expert pottery analyst. Describe this pottery piece's key physical features
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

export function parseResponseJson(text: string): MatchResult {
	const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

	try {
		const raw = JSON.parse(cleaned);
		// Prompt asks for a single object, but if Gemini returns an array pick the highest-confidence entry
		const parsed = Array.isArray(raw)
			? (raw as { confidence?: number }[]).reduce((best, cur) =>
					(cur.confidence ?? 0) > (best.confidence ?? 0) ? cur : best
				)
			: raw;
		// updatedDescription may be a JSON object (structured identity card) or a string
		let updatedDescription = parsed.updatedDescription ?? '';
		if (typeof updatedDescription === 'object' && updatedDescription !== null) {
			updatedDescription = JSON.stringify(updatedDescription);
		}
		// Hard-enforce profile mismatch / none found rules
		const disqualified =
			typeof parsed.distinguishing_feature === 'string' &&
			(parsed.distinguishing_feature.toLowerCase().includes('profile mismatch') ||
				parsed.distinguishing_feature.toLowerCase().includes('none found'));
		const matchedPieceId = disqualified ? null : (parsed.matchedPieceId ?? null);
		const confidence = disqualified
			? 0
			: typeof parsed.confidence === 'number'
				? parsed.confidence
				: 0;

		return {
			matchedPieceId,
			confidence,
			reasoning: [parsed.depth_comparison, parsed.distinguishing_feature, parsed.reasoning]
				.filter(Boolean)
				.join(' — '),
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

export function buildMatchingParts(
	newImageBase64: string,
	newDepthBase64: string | null,
	candidates: MatchCandidate[]
): GeminiPart[] {
	const parts: GeminiPart[] = [
		{ text: 'Here is the NEW pottery photo:' },
		{ inlineData: { mimeType: 'image/jpeg', data: newImageBase64 } }
	];

	if (newDepthBase64) {
		parts.push({ text: 'Depth map of the new photo (brighter = closer to camera):' });
		parts.push({ inlineData: { mimeType: 'image/jpeg', data: newDepthBase64 } });
	}

	parts.push({
		text: '\nCompare the new photo against each candidate using depth maps to assess 3D profile shapes:\n'
	});

	for (let i = 0; i < candidates.length; i++) {
		const c = candidates[i];
		parts.push({ text: `\n--- Candidate ${i + 1} ---\nID: ${c.id}\nName: ${c.name}` });

		if (c.imageBase64) {
			parts.push({ text: 'Depth map (brighter = closer to camera):' });
			parts.push({ inlineData: { mimeType: 'image/jpeg', data: c.imageBase64 } });
		}

		if (c.ai_description) {
			let formattedDesc: string;
			try {
				const parsed = JSON.parse(c.ai_description);
				formattedDesc = JSON.stringify(parsed, null, 2);
			} catch {
				formattedDesc = c.ai_description;
			}
			parts.push({ text: `Identity Card (supplementary):\n${formattedDesc}` });
		}
	}

	parts.push({ text: '\nReturn only JSON.' });

	return parts;
}

export function buildThumbnailMatchingParts(
	newImageBase64: string,
	candidates: MatchCandidate[]
): GeminiPart[] {
	const parts: GeminiPart[] = [
		{ text: 'Here is the NEW pottery photo:' },
		{ inlineData: { mimeType: 'image/jpeg', data: newImageBase64 } }
	];

	parts.push({ text: '\nCompare the new photo against each candidate:\n' });

	for (let i = 0; i < candidates.length; i++) {
		const c = candidates[i];
		parts.push({ text: `\n--- Candidate ${i + 1} ---\nID: ${c.id}\nName: ${c.name}` });

		if (c.imageBase64) {
			parts.push({ text: 'Reference photo:' });
			parts.push({ inlineData: { mimeType: 'image/jpeg', data: c.imageBase64 } });
		}

		if (c.ai_description) {
			let formattedDesc: string;
			try {
				const parsed = JSON.parse(c.ai_description);
				formattedDesc = JSON.stringify(parsed, null, 2);
			} catch {
				formattedDesc = c.ai_description;
			}
			parts.push({ text: `Identity Card (supplementary):\n${formattedDesc}` });
		}
	}

	parts.push({ text: '\nReturn only JSON.' });

	return parts;
}
