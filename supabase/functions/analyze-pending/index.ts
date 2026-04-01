import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Jimp } from 'https://esm.sh/jimp@1';
import {
	MATCH_SYSTEM_PROMPT,
	DESCRIBE_SYSTEM_PROMPT,
	BOUNDS_PROMPT,
	parseResponseJson,
	parseBoundsResponse,
	buildMatchingParts,
	type MatchResult,
	type MatchCandidate
} from '../_shared/matching.ts';

const GEMINI_MODEL = 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface PendingUploadRecord {
	id: string;
	user_id: string;
	temp_storage_path: string;
}

interface WebhookPayload {
	type: string;
	record: PendingUploadRecord;
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

async function cropToBounds(
	imageBase64: string,
	geminiKey: string
): Promise<string> {
	// Detect piece bounds via Gemini
	const boundsResp = await fetch(
		`${GEMINI_API_BASE}/gemini-2.5-flash:generateContent?key=${geminiKey}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{
					role: 'user',
					parts: [
						{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
						{ text: BOUNDS_PROMPT }
					]
				}],
				generationConfig: { responseMimeType: 'application/json' }
			})
		}
	);

	if (!boundsResp.ok) return imageBase64;

	const boundsData = await boundsResp.json();
	const boundsText: string = boundsData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
	const bounds = parseBoundsResponse(boundsText);
	if (!bounds) return imageBase64;

	// Crop using jimp
	try {
		const PAD = 0.05;
		const imgBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
		const image = await Jimp.fromBuffer(imgBytes.buffer);
		const w = image.width;
		const h = image.height;
		const left = Math.max(0, Math.floor((bounds.x1 - PAD) * w));
		const top = Math.max(0, Math.floor((bounds.y1 - PAD) * h));
		const right = Math.min(w, Math.ceil((bounds.x2 + PAD) * w));
		const bottom = Math.min(h, Math.ceil((bounds.y2 + PAD) * h));
		image.crop({ x: left, y: top, w: right - left, h: bottom - top });
		const croppedBuffer = await image.getBuffer('image/jpeg');
		return btoa(String.fromCharCode(...new Uint8Array(croppedBuffer)));
	} catch {
		return imageBase64;
	}
}

async function generateDepthMap(
	replicateToken: string,
	imageBase64: string,
	geminiKey: string
): Promise<string | null> {
	const croppedBase64 = await cropToBounds(imageBase64, geminiKey).catch(() => imageBase64);

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
			input: { image: `data:image/jpeg;base64,${croppedBase64}`, model_size: 'Base' }
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
				? generateDepthMap(replicateToken, imageBase64, geminiKey)
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
			const matchCandidates: MatchCandidate[] = await Promise.all(
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

					return { id: c.id, name: c.name, ai_description: c.ai_description, depthBase64, coverBase64 };
				})
			);

			const parts = buildMatchingParts(imageBase64, newDepthBase64, matchCandidates);
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
