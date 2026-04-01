import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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

Each candidate also has a text identity card as supplementary context for features that
may not be visible in the reference photo angle.

Return this exact JSON structure:
{
  "matchedPieceId": "<uuid string or null if no match>",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation citing specific visual features that match or mismatch>",
  "suggestedName": "<suggested name if new piece, empty string if matched>",
  "updatedDescription": "<brief text description of the piece's key physical features>"
}

Rules:
- Set matchedPieceId to null when confidence < 0.60 (treat as new piece)
- Confidence 0.60-0.79: possible match, note uncertainty in reasoning
- Confidence 0.80+: confident match`;

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

		let result: MatchResult;

		// Generate embedding for similarity search
		const embedding = await generateEmbedding(geminiKey, imageBase64);

		// Find nearest candidates via pgvector
		const { data: matches } = await supabase.rpc('match_pieces', {
			query_embedding: JSON.stringify(embedding),
			match_user_id: userId,
			match_count: 9
		});

		const candidates: MatchPieceRow[] = matches ?? [];

		if (candidates.length === 0) {
			// No candidates — just describe
			const text = await callGemini(geminiKey, DESCRIBE_SYSTEM_PROMPT, [
				{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
				{
					text: 'Describe this pottery piece. Return only the JSON object.'
				}
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

			// Download candidate thumbnails in parallel
			const candidatesWithImages = await Promise.all(
				candidates.map(async (c) => {
					const coverPath = c.cover_image_id
						? coverPathMap.get(c.cover_image_id)
						: null;
					let coverBase64: string | null = null;

					if (coverPath) {
						try {
							// Try thumbnail first
							const thumbPath = coverPath.replace(
								/\/([^/]+)\.jpg$/,
								'/thumb_$1.jpg'
							);
							const { data: thumbBlob } = await supabase.storage
								.from('pottery-images')
								.download(thumbPath);
							if (thumbBlob) {
								const thumbBytes = await thumbBlob.arrayBuffer();
								coverBase64 = btoa(
									String.fromCharCode(...new Uint8Array(thumbBytes))
								);
							}
						} catch {
							// Thumbnail not available — skip image for this candidate
						}
					}

					return { ...c, coverBase64 };
				})
			);

			// Build multi-image matching request
			const parts: Array<
				{ text: string } | { inlineData: { mimeType: string; data: string } }
			> = [
				{ text: 'Here is the NEW pottery photo to identify:' },
				{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
				{
					text: "\nHere are the candidate pieces from this potter's collection. Compare the new photo visually against each candidate's reference photo:\n"
				}
			];

			for (let i = 0; i < candidatesWithImages.length; i++) {
				const c = candidatesWithImages[i];
				parts.push({
					text: `\n--- Candidate ${i + 1} ---\nID: ${c.id}\nName: ${c.name}`
				});

				if (c.coverBase64) {
					parts.push({ text: 'Reference photo:' });
					parts.push({
						inlineData: { mimeType: 'image/jpeg', data: c.coverBase64 }
					});
				}

				if (c.ai_description) {
					let formattedDesc: string;
					try {
						const parsed = JSON.parse(c.ai_description);
						formattedDesc = JSON.stringify(parsed, null, 2);
					} catch {
						formattedDesc = c.ai_description;
					}
					parts.push({
						text: `Identity Card (supplementary):\n${formattedDesc}`
					});
				}
			}

			parts.push({
				text: '\nDoes the new photo match any candidate? Compare shapes, proportions, and structural features visually. Ignore color/finish differences. Return only JSON.'
			});

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
