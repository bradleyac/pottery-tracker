import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MATCH_SYSTEM_PROMPT = `You are an expert pottery analyst helping potters track their ceramic pieces over time.
Your task is to determine whether a new photo shows an existing piece or a new one.

Focus on PERSISTENT physical features that survive across pottery stages (greenware → bisque → glazed → fired):
- Form type and proportions (height-to-width ratio, wall curvature, symmetry vs asymmetry)
- Rim profile, foot ring style, and base shape
- Rim shape from above — circular vs oval/irregular (a key differentiator for hand-thrown pieces)
- Number, placement, and style of handles/spouts/knobs/lugs
- Carved, incised, or stamped decorative patterns and their positions
- Distinctive imperfections: wobbles, thumb marks, lopsided walls, uneven rim height, asymmetries, cracks
- Structural details like lid seats, galleries, or flanges

IGNORE features that change across stages — NEVER mention these:
- Color, clay body appearance (raw clay vs bisque vs glaze)
- Surface finish (matte/glossy)
- Exact texture (rough greenware vs smooth glaze)
- Do not attempt to identify what stage the piece is in

Each existing piece has a structured identity card with these persistent features.
Compare the new photo against each candidate's identity card, focusing on whether the
physical form and distinctive marks match, regardless of the piece's current stage.

Return this exact JSON structure:
{
  "matchedPieceId": "<uuid string or null if no match>",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation citing specific matching/mismatching features>",
  "suggestedName": "<suggested name if new piece, empty string if matched>",
  "updatedDescription": <structured identity card object — see below>
}

The updatedDescription must be a JSON object with this structure:
{
  "form": "<basic form type: bowl, mug, vase, plate, cup, pitcher, etc.>",
  "profile": "<shape description: wall curvature, depth, openness>",
  "rimStyle": "<rim lip profile (rolled, squared, flared, etc.) AND rim contour — describe the actual shape. Hand-thrown rims are almost never perfectly round; describe what you see (e.g. slightly oval, wider on one axis, dips on one side)>",
  "footRing": "<foot/base description: trimmed foot ring, flat base, pedestal, etc.>",
  "handles": { "count": <number>, "style": "<description if any>" },
  "distinctiveMarks": ["<ONLY features you can actually observe — imperfections, asymmetries, wobbles, lopsidedness. Do not list absence of features or unobservable details.>"],
  "decorativeElements": ["<carved patterns, stamps, textures and their positions>"],
  "approximateProportions": "<height-to-width ratio or relative dimensions>",
  "surfaceNotes": "<trimming marks, tool marks, construction method clues — NOT color or stage>"
}

Rules:
- Set matchedPieceId to null when confidence < 0.60 (treat as new piece)
- Confidence 0.60-0.79: possible match, note uncertainty in reasoning
- Confidence 0.80+: confident match
- Always return the full structured identity card in updatedDescription, even for matches`;

const DESCRIBE_SYSTEM_PROMPT = `You are an expert pottery analyst. Your task is to create a structured identity card
that can UNIQUELY IDENTIFY this specific piece among a collection of similar pieces by the same potter.

A potter may have many bowls, many mugs, many plates. Your job is to describe what makes THIS piece
distinguishable from other pieces of the same type. Generic descriptions like "shallow bowl with
gently curving walls" are useless — they match every bowl. Instead, describe the SPECIFIC geometry:
exact profile curve, how the rim transitions to the wall, whether there's a distinct shoulder or
inflection point, the specific ratio of rim width to well depth, etc.

Think of it like a fingerprint — what combination of features would let you pick this piece out
of a lineup of 10 similar pieces?

The identity card must capture PERSISTENT features that survive across all pottery stages
(greenware, bisque, glazed, fired). NEVER mention color, surface finish, glaze, or clay body
appearance — these change completely across stages.

Return this exact JSON structure:
{
  "form": "<specific form type — not just 'bowl' but e.g. 'wide shallow plate-like bowl with pronounced flat rim' or 'deep steep-walled cereal bowl'>",
  "profile": "<describe the SPECIFIC cross-section: how do the walls curve? Is there a distinct shoulder, inflection point, or angle change? How does the wall meet the rim? How does it meet the base? Be precise enough to distinguish from similar pieces>",
  "rimStyle": "<rim lip profile AND rim contour. Hand-thrown rims are almost never perfectly round — describe the actual shape you see (oval, wider on one axis, dips on one side, etc.). Also describe the rim width/thickness and how it relates to the wall>",
  "footRing": "<foot/base description: trimmed foot ring, flat base, pedestal, etc. Include relative size of foot to body>",
  "handles": { "count": <number>, "style": "<description if any>" },
  "distinctiveMarks": ["<ONLY features you can actually observe — specific imperfections, asymmetries, wobbles. Describe WHERE on the piece and HOW PRONOUNCED. Do not list absence of features.>"],
  "decorativeElements": ["<carved patterns, stamps, textures and their SPECIFIC positions>"],
  "approximateProportions": "<be specific: ratio of height to width, rim diameter vs base diameter, wall thickness relative to size>",
  "surfaceNotes": "<tool marks and construction method clues ONLY — not color or stage>"
}

Only describe features you can actually observe in the photo. Do not infer details about
surfaces or angles that are not visible.`;

interface PendingUploadRecord {
	id: string;
	user_id: string;
	temp_storage_path: string;
}

interface WebhookPayload {
	type: string;
	record: PendingUploadRecord;
}

interface ExistingPiece {
	id: string;
	name: string;
	ai_description: string | null;
}

interface MatchResult {
	matchedPieceId: string | null;
	confidence: number;
	reasoning: string;
	suggestedName: string;
	updatedDescription: string;
}

async function callGemini(
	apiKey: string,
	systemInstruction: string,
	parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>
): Promise<string> {
	const resp = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			systemInstruction: { parts: [{ text: systemInstruction }] },
			contents: [{ role: 'user', parts }],
			generationConfig: {
				responseMimeType: 'application/json'
			}
		})
	});

	if (!resp.ok) {
		const errText = await resp.text();
		throw new Error(`Gemini API error ${resp.status}: ${errText}`);
	}

	const data = await resp.json();
	return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function parseResponseJson(text: string): MatchResult {
	const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
	try {
		const parsed = JSON.parse(cleaned);
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

Deno.serve(async (req: Request) => {
	// Only accept POST
	if (req.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 });
	}

	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
	const geminiKey = Deno.env.get('GEMINI_API_KEY')!;

	const supabase = createClient(supabaseUrl, serviceRoleKey);

	let payload: WebhookPayload;
	try {
		payload = await req.json();
	} catch {
		return new Response('Invalid JSON', { status: 400 });
	}

	if (payload.type !== 'INSERT' || !payload.record?.id) {
		return new Response('Not an INSERT event', { status: 200 });
	}

	const { id: uploadId, user_id: userId, temp_storage_path: tempPath } = payload.record;

	try {
		// Download the temp image (pre-resized to 512px by the bulk-upload route)
		const { data: blobData, error: dlErr } = await supabase.storage
			.from('pottery-images')
			.download(tempPath);
		if (dlErr || !blobData) throw new Error('Failed to download image');

		const bytes = await blobData.arrayBuffer();
		const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));

		// Fetch existing pieces for this user
		const { data: pieces } = await supabase
			.from('pieces')
			.select('id, name, ai_description')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		const existingPieces: ExistingPiece[] = pieces ?? [];

		let result: MatchResult;

		if (existingPieces.length === 0) {
			// No pieces to match — just get a description
			const text = await callGemini(geminiKey, DESCRIBE_SYSTEM_PROMPT, [
				{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
				{
					text: 'Create a structured identity card for this pottery piece. Return only the JSON object.'
				}
			]);

			let description: string;
			try {
				const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
				JSON.parse(cleaned);
				description = cleaned;
			} catch {
				description = text;
			}

			result = {
				matchedPieceId: null,
				confidence: 0,
				reasoning: 'No existing pieces to match against.',
				suggestedName: 'New Piece',
				updatedDescription: description
			};
		} else {
			const piecesText = existingPieces
				.map((p: ExistingPiece, i: number) => {
					const desc = p.ai_description ?? 'No description yet';
					let formattedDesc: string;
					try {
						const parsed = JSON.parse(desc);
						formattedDesc = JSON.stringify(parsed, null, 2);
					} catch {
						formattedDesc = desc;
					}
					return `${i + 1}. ID: ${p.id}\n   Name: ${p.name}\n   Identity Card:\n${formattedDesc}`;
				})
				.join('\n\n');

			const text = await callGemini(geminiKey, MATCH_SYSTEM_PROMPT, [
				{ text: 'Here is the new pottery photo to analyze:' },
				{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
				{
					text: `\nExisting pieces (match against their identity cards):\n${piecesText}\n\nDoes the new photo match any existing piece? Return only JSON.`
				}
			]);

			result = parseResponseJson(text);

			// Validate matchedPieceId is actually in our list
			if (result.matchedPieceId) {
				const exists = existingPieces.some(
					(p: ExistingPiece) => p.id === result.matchedPieceId
				);
				if (!exists) {
					result.matchedPieceId = null;
					result.confidence = 0;
				}
			}
		}

		// Update pending_uploads row with results
		await supabase
			.from('pending_uploads')
			.update({
				status: 'ready',
				matched_piece_id: result.matchedPieceId,
				confidence: result.confidence,
				claude_reasoning: result.reasoning,
				suggested_name: result.suggestedName,
				updated_description: result.updatedDescription
			})
			.eq('id', uploadId);

		return new Response(JSON.stringify({ ok: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		console.error('analyze-pending error:', err);

		// Mark as failed
		await supabase
			.from('pending_uploads')
			.update({ status: 'failed' })
			.eq('id', uploadId);

		return new Response(JSON.stringify({ error: String(err) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
});
