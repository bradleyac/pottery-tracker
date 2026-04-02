import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Jimp } from 'https://esm.sh/jimp@1';
import {
	BOUNDS_PROMPT,
	DESCRIBE_SYSTEM_PROMPT,
	parseBoundsResponse,
	parseResponseJson,
	type MatchResult
} from '../_shared/matching.ts';
import {
	createMatchingStrategy,
	type RawCandidate,
	type StrategyIO
} from '../_shared/strategies.ts';

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

async function generateDepthMapFromReplicate(
	replicateToken: string,
	imageBase64: string,
	geminiKey: string
): Promise<string | null> {
	const croppedBase64 = await cropToBounds(imageBase64, geminiKey).catch(() => imageBase64);

	const version = Deno.env.get('REPLICATE_DEPTH_MODEL') ?? DEFAULT_DEPTH_VERSION;
	let createResp: Response | null = null;
	for (let attempt = 0; attempt < 5; attempt++) {
		createResp = await fetch('https://api.replicate.com/v1/predictions', {
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
		if (createResp.status !== 429) break;
		const retryBody = await createResp.json().catch(() => ({}));
		const waitMs = ((retryBody.retry_after ?? 1) + 1) * 1000;
		console.log(`[analyze-pending] Replicate rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1})`);
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}
	if (!createResp!.ok) return null;

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

		// Read matching strategy from DB
		const { data: configData } = await supabase
			.from('app_config')
			.select('value')
			.eq('key', 'matching_strategy')
			.single();
		const strategyName = configData?.value ?? 'thumbnail';

		// Build Deno IO adapter — closures capture supabase, tempPath, replicateToken, geminiKey
		const denoIO: StrategyIO = {
			downloadImage: async (path) => {
				try {
					const { data } = await supabase.storage.from('pottery-images').download(path);
					if (!data) return null;
					const bytes = await data.arrayBuffer();
					return btoa(String.fromCharCode(...new Uint8Array(bytes)));
				} catch {
					return null;
				}
			},
			generateDepthMap: async (base64) => {
				// Try the pre-stored depth map first (generated by bulk-upload route)
				const prebuiltPath = tempPath.replace(/\/([^/]+)\.jpg$/, '/depth_$1.jpg');
				const prebuilt = await denoIO.downloadImage(prebuiltPath);
				if (prebuilt) {
					console.log('[analyze-pending] using pre-stored depth map');
					return prebuilt;
				}
				if (!replicateToken) return null;
				return generateDepthMapFromReplicate(replicateToken, base64, geminiKey);
			}
		};

		const strategy = createMatchingStrategy(strategyName, denoIO);
		const embedding = await generateEmbedding(geminiKey, imageBase64);

		let result: MatchResult;

		// Find nearest candidates via pgvector
		const { data: matches } = await supabase.rpc('match_pieces', {
			query_embedding: JSON.stringify(embedding),
			match_user_id: userId,
			match_count: 8
		});

		const candidates: MatchPieceRow[] = matches ?? [];

		const diag: Record<string, unknown> = {
			strategy: strategyName,
			candidatesFound: candidates.length,
			candidateNames: candidates.map((c) => c.name)
		};

		console.log('[analyze-pending] diagnostics:', JSON.stringify(diag));

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
					.select('id, storage_path')
					.in('id', coverImageIds);

				if (coverImages) {
					for (const img of coverImages) {
						coverPathMap.set(img.id, img.storage_path);
					}
				}
			}

			const rawCandidates: RawCandidate[] = candidates.map((c) => ({
				id: c.id,
				name: c.name,
				ai_description: c.ai_description,
				coverPath: c.cover_image_id ? (coverPathMap.get(c.cover_image_id) ?? null) : null
			}));

			console.log('[analyze-pending] step: gemini_comparison');
			const { base64: newBase64, depthBase64: newDepthBase64 } = await strategy.prepareNewImage(imageBase64);
			const matchCandidates = await strategy.fetchCandidateImages(rawCandidates);
			const parts = strategy.buildParts(newBase64, newDepthBase64, matchCandidates);
			const matchText = await callGemini(geminiKey, strategy.systemPrompt, parts);
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
