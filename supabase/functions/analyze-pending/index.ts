import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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
- If distinguishing_feature is 'none found', matchedPieceId MUST be null
- Set matchedPieceId to null when confidence < 0.70
- Confidence 0.70–0.84: possible match with noted uncertainty
- Confidence 0.85+: strong match — depth profiles consistent AND overall form/decoration consistent with no contradicting evidence`;

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

interface PendingUploadRecord {
	id: string;
	user_id: string;
	temp_storage_path: string;
}

interface WebhookPayload {
	type: string;
	record: PendingUploadRecord;
}

interface MatchResult {
	matchedPieceId: string | null;
	confidence: number;
	reasoning: string;
	suggestedName: string;
	updatedDescription: string;
}

interface MatchPieceRow {
	id: string;
	name: string;
	ai_description: string | null;
	cover_image_id: string | null;
	similarity: number;
}

async function callGemini(
	apiKey: string,
	systemInstruction: string,
	parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>
): Promise<string> {
	const resp = await fetch(`${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			systemInstruction: { parts: [{ text: systemInstruction }] },
			contents: [{ role: 'user', parts }],
			generationConfig: { responseMimeType: 'application/json' }
		})
	});

	if (!resp.ok) {
		const errText = await resp.text();
		throw new Error(`Gemini API error ${resp.status}: ${errText}`);
	}

	const data = await resp.json();
	return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function generateEmbedding(apiKey: string, imageBase64: string): Promise<number[]> {
	const resp = await fetch(
		`${GEMINI_API_BASE}/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				content: {
					parts: [{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }]
				},
				outputDimensionality: 768
			})
		}
	);

	if (!resp.ok) {
		const errText = await resp.text();
		throw new Error(`Gemini Embedding API error ${resp.status}: ${errText}`);
	}

	const data = await resp.json();
	return data.embedding?.values ?? [];
}

const DEFAULT_DEPTH_VERSION =
	'chenxwh/depth-anything-v2:b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4';

async function generateDepthMap(replicateToken: string, imageBase64: string): Promise<string | null> {
	const version = Deno.env.get('REPLICATE_DEPTH_MODEL') ?? DEFAULT_DEPTH_VERSION;
	const createResp = await fetch('https://api.replicate.com/v1/predictions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${replicateToken}`,
			'Content-Type': 'application/json',
			Prefer: 'wait'
		},
		body: JSON.stringify({
			version,
			input: { image: `data:image/jpeg;base64,${imageBase64}`, model_size: 'Base' }
		}),
		signal: AbortSignal.timeout(90_000)
	});
	if (!createResp.ok) return null;

	const prediction = await createResp.json();
	if (prediction.status === 'failed') return null;

	const outputUrl: string = prediction.output?.grey_depth;
	if (!outputUrl) return null;

	const imgResp = await fetch(outputUrl, { signal: AbortSignal.timeout(30_000) });
	if (!imgResp.ok) return null;

	const bytes = await imgResp.arrayBuffer();
	return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function parseResponseJson(text: string): MatchResult {
	const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
	try {
		const raw = JSON.parse(cleaned);
		// Gemini sometimes wraps the response in an array
		const parsed = Array.isArray(raw) ? raw[0] : raw;
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

Deno.serve(async (req: Request) => {
	if (req.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 });
	}

	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
	const geminiKey = Deno.env.get('GEMINI_API_KEY')!;
	const replicateToken = Deno.env.get('REPLICATE_API_TOKEN') ?? '';

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

		// Try to download pre-generated depth map (stored by bulk-upload route)
		const prebuiltDepthPath = tempPath.replace(/\/([^/]+)\.jpg$/, '/depth_$1.jpg');
		let newDepthBase64: string | null = null;
		try {
			const { data: depthBlob } = await supabase.storage
				.from('pottery-images')
				.download(prebuiltDepthPath);
			if (depthBlob) {
				const depthBytes = await depthBlob.arrayBuffer();
				newDepthBase64 = btoa(String.fromCharCode(...new Uint8Array(depthBytes)));
				console.log('[analyze-pending] using pre-stored depth map');
			}
		} catch {
			// Not available — will fall back to Replicate below
		}

		// Generate embedding; if no pre-stored depth map, try Replicate as fallback
		const [embedding] = await Promise.all([
			generateEmbedding(geminiKey, imageBase64),
			newDepthBase64 === null && replicateToken
				? generateDepthMap(replicateToken, imageBase64)
					.then((b) => { newDepthBase64 = b; })
					.catch((err) => { console.error('[analyze-pending] Replicate depth map failed:', err); })
				: Promise.resolve()
		]);

		let result: MatchResult;

		// Find nearest candidates via pgvector
		const { data: matches } = await supabase.rpc('match_pieces', {
			query_embedding: JSON.stringify(embedding),
			match_user_id: userId,
			match_count: 8
		});

		const candidates: MatchPieceRow[] = matches ?? [];

		if (candidates.length === 0) {
			// No candidates — just describe
			const text = await callGemini(geminiKey, DESCRIBE_SYSTEM_PROMPT, [
				{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
				{ text: 'Describe this pottery piece. Return only the JSON object.' }
			]);

			let description: string;
			try {
				const cleaned = text
					.replace(/^```(?:json)?\n?/m, '')
					.replace(/\n?```$/m, '')
					.trim();
				JSON.parse(cleaned);
				description = cleaned;
			} catch {
				description = text;
			}

			result = {
				matchedPieceId: null,
				confidence: 0,
				reasoning: 'No candidate pieces to match against.',
				suggestedName: 'New Piece',
				updatedDescription: description
			};
		} else {
			// Get cover image paths for candidates
			const coverImageIds = candidates
				.map((c) => c.cover_image_id)
				.filter(Boolean) as string[];

			const coverPathMap = new Map<string, string>();
			if (coverImageIds.length > 0) {
				const { data: coverImages } = await supabase
					.from('images')
					.select('id, storage_path, piece_id, user_id')
					.in('id', coverImageIds);

				if (coverImages) {
					for (const img of coverImages) {
						coverPathMap.set(img.id, img.storage_path);
					}
				}
			}

			// Download depth maps (primary) or thumbnails (fallback) in parallel
			const candidatesWithImages = await Promise.all(
				candidates.map(async (c) => {
					const coverPath = c.cover_image_id ? coverPathMap.get(c.cover_image_id) : null;
					let depthBase64: string | null = null;
					let coverBase64: string | null = null;

					if (coverPath) {
						// Try depth map first
						try {
							const depthPath = coverPath.replace(/\/([^/]+)\.jpg$/, '/depth_$1.jpg');
							const { data: depthBlob } = await supabase.storage
								.from('pottery-images')
								.download(depthPath);
							if (depthBlob) {
								const depthBytes = await depthBlob.arrayBuffer();
								depthBase64 = btoa(String.fromCharCode(...new Uint8Array(depthBytes)));
							}
						} catch {
							// No depth map — fall back to thumbnail
						}

						if (!depthBase64) {
							try {
								const thumbPath = coverPath.replace(/\/([^/]+)\.jpg$/, '/thumb_$1.jpg');
								const { data: thumbBlob } = await supabase.storage
									.from('pottery-images')
									.download(thumbPath);
								if (thumbBlob) {
									const thumbBytes = await thumbBlob.arrayBuffer();
									coverBase64 = btoa(String.fromCharCode(...new Uint8Array(thumbBytes)));
								}
							} catch {
								// Skip image for this candidate
							}
						}
					}

					return { ...c, depthBase64, coverBase64 };
				})
			);

			// Build matching request: new RGB + new depth + candidate depth maps
			const parts: Array<
				{ text: string } | { inlineData: { mimeType: string; data: string } }
			> = [
					{ text: 'Here is the NEW pottery photo:' },
					{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
				];

			if (newDepthBase64) {
				parts.push({ text: 'Depth map of the new photo (brighter = closer to camera):' });
				parts.push({ inlineData: { mimeType: 'image/jpeg', data: newDepthBase64 } });
			}

			parts.push({ text: "\nCompare the new photo against each candidate using depth maps to assess 3D profile shapes:\n" });

			for (let i = 0; i < candidatesWithImages.length; i++) {
				const c = candidatesWithImages[i];
				parts.push({ text: `\n--- Candidate ${i + 1} ---\nID: ${c.id}\nName: ${c.name}` });

				if (c.depthBase64) {
					parts.push({ text: 'Depth map (brighter = closer to camera):' });
					parts.push({ inlineData: { mimeType: 'image/jpeg', data: c.depthBase64 } });
				} else if (c.coverBase64) {
					parts.push({ text: 'Reference photo (no depth map available):' });
					parts.push({ inlineData: { mimeType: 'image/jpeg', data: c.coverBase64 } });
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

			const matchText = await callGemini(geminiKey, MATCH_SYSTEM_PROMPT, parts);
			result = parseResponseJson(matchText);

			// Validate matchedPieceId
			if (result.matchedPieceId) {
				const exists = candidates.some((c) => c.id === result.matchedPieceId);
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
