import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Jimp } from 'https://esm.sh/jimp@1';
import {
	DESCRIBE_SYSTEM_PROMPT,
	parseResponseJson,
	type MatchResult
} from '../_shared/matching.ts';
import { ThumbnailStrategy, type RawCandidate, type StrategyIO } from '../_shared/strategies.ts';

const GEMINI_MODEL = 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const MAX_ANALYZE_ATTEMPTS = 6;
const BACKOFF_SECONDS = [30, 60, 120, 300, 600, 1200];

function nextBackoff(attempts: number): number {
	const idx = Math.min(attempts, BACKOFF_SECONDS.length - 1);
	return BACKOFF_SECONDS[idx];
}

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_PATTERNS = [
	/rate.?limit/i,
	/quota/i,
	/resource.*exhaust/i,
	/ECONNRESET/,
	/ETIMEDOUT/,
	/ENOTFOUND/,
	/fetch.*failed/i,
	/network.*error/i,
	/AbortError/,
	/timeout/i
];

function isTransientError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);

	const statusMatch = msg.match(/error (\d{3})/i) ?? msg.match(/^(\d{3}):/);
	if (statusMatch) {
		const code = parseInt(statusMatch[1], 10);
		if (TRANSIENT_HTTP_STATUSES.has(code)) return true;
		if (code >= 400 && code < 500 && !TRANSIENT_HTTP_STATUSES.has(code)) return false;
	}

	return TRANSIENT_PATTERNS.some((re) => re.test(msg));
}

interface PendingUploadRecord {
	id: string;
	user_id: string;
	temp_storage_path: string;
	batch_id: string | null;
	analyze_attempts: number;
}

interface WebhookPayload {
	type: string;
	record: PendingUploadRecord;
}

interface TickPayload {
	uploadId: string;
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
	const resp = await fetch(`${GEMINI_API_BASE}/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			content: {
				parts: [{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }]
			},
			outputDimensionality: 768
		})
	});

	if (!resp.ok) {
		const errText = await resp.text();
		throw new Error(`Gemini Embedding API error ${resp.status}: ${errText}`);
	}

	const data = await resp.json();
	return data.embedding?.values ?? [];
}

const DEFAULT_BG_REMOVE_VERSION =
	'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003';

async function removeBackgroundDeno(replicateToken: string, imageBase64: string): Promise<string> {
	const version = Deno.env.get('REPLICATE_BG_REMOVE_MODEL') ?? DEFAULT_BG_REMOVE_VERSION;

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
				input: { image: `data:image/jpeg;base64,${imageBase64}` }
			}),
			signal: AbortSignal.timeout(60_000)
		});
		if (createResp.status !== 429) break;
		const retryBody = await createResp.json().catch(() => ({}));
		const waitMs = ((retryBody.retry_after ?? 1) + 1) * 1000;
		console.log(
			`[analyze-pending] BG remove rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1})`
		);
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}

	if (!createResp!.ok) throw new Error(`Background removal failed: ${createResp!.status}`);

	const prediction = await createResp!.json();
	if (prediction.status === 'failed') throw new Error('Background removal prediction failed');

	const outputUrl: string = prediction.output;
	if (!outputUrl) throw new Error('Background removal returned no output');

	const pngResp = await fetch(outputUrl, { signal: AbortSignal.timeout(30_000) });
	if (!pngResp.ok)
		throw new Error(`Failed to download background-removed image: ${pngResp.status}`);

	const pngBytes = new Uint8Array(await pngResp.arrayBuffer());

	// Composite onto white using Jimp
	const pngImage = await Jimp.fromBuffer(pngBytes.buffer as ArrayBuffer);
	const white = new Jimp({ width: pngImage.width, height: pngImage.height, color: 0xffffffff });
	white.composite(pngImage, 0, 0);
	const jpegBuffer = await white.getBuffer('image/jpeg');
	return btoa(String.fromCharCode(...new Uint8Array(jpegBuffer)));
}

Deno.serve(async (req: Request) => {
	if (req.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 });
	}

	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

	const authHeader = req.headers.get('Authorization');
	if (authHeader !== `Bearer ${serviceRoleKey}`) {
		return new Response('Unauthorized', { status: 401 });
	}
	const geminiKey = Deno.env.get('GEMINI_API_KEY')!;
	const replicateToken = Deno.env.get('REPLICATE_API_TOKEN') ?? '';

	const supabase = createClient(supabaseUrl, serviceRoleKey);

	let rawPayload: unknown;
	try {
		rawPayload = await req.json();
	} catch {
		return new Response('Invalid JSON', { status: 400 });
	}

	// Resolve the upload record — accept either a webhook INSERT event or a tick {uploadId}
	let uploadRecord: PendingUploadRecord | null = null;

	if (
		rawPayload &&
		typeof rawPayload === 'object' &&
		'uploadId' in rawPayload &&
		typeof (rawPayload as TickPayload).uploadId === 'string'
	) {
		// Tick-driven invocation: look up the row
		const tickPayload = rawPayload as TickPayload;
		const { data, error } = await supabase
			.from('pending_uploads')
			.select('id, user_id, temp_storage_path, batch_id, analyze_attempts')
			.eq('id', tickPayload.uploadId)
			.maybeSingle();

		if (error || !data) {
			console.warn('[analyze-pending] tick: upload not found:', tickPayload.uploadId);
			return new Response(JSON.stringify({ ok: true, skipped: true }), {
				headers: { 'Content-Type': 'application/json' }
			});
		}
		uploadRecord = data as PendingUploadRecord;
	} else {
		// Webhook INSERT event
		const webhookPayload = rawPayload as WebhookPayload;
		if (webhookPayload.type !== 'INSERT' || !webhookPayload.record?.id) {
			return new Response('Not an INSERT event', { status: 200 });
		}
		uploadRecord = {
			...webhookPayload.record,
			analyze_attempts: 0
		};
	}

	const {
		id: uploadId,
		user_id: userId,
		temp_storage_path: tempPath,
		batch_id: batchId,
		analyze_attempts: currentAttempts
	} = uploadRecord;

	async function setStatus(id: string, status: string) {
		await supabase.from('pending_uploads').update({ status }).eq('id', id);
	}

	try {
		// Download the temp image (pre-resized to 512px by the bulk-upload route)
		const { data: blobData, error: dlErr } = await supabase.storage
			.from('pottery-images')
			.download(tempPath);
		if (dlErr || !blobData) throw new Error('Failed to download image');

		const bytes = await blobData.arrayBuffer();
		const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));

		// Remove background for cleaner embedding and matching — non-fatal, store clean temp.
		// On retries, skip Replicate if the clean image was already stored successfully.
		let cleanImageBase64 = imageBase64;
		const cleanTempPath = tempPath.replace(/([^/]+\.jpg)$/, 'clean_$1');

		if (replicateToken) {
			// Check if a previous attempt already produced a clean image
			const { data: existingClean } = await supabase.storage
				.from('pottery-images')
				.download(cleanTempPath);

			if (existingClean) {
				const existingBytes = await existingClean.arrayBuffer();
				cleanImageBase64 = btoa(String.fromCharCode(...new Uint8Array(existingBytes)));
				console.log('[analyze-pending] using cached background-removed image');
			} else {
				await setStatus(uploadId, 'preprocessing');
				try {
					cleanImageBase64 = await removeBackgroundDeno(replicateToken, imageBase64);
					const cleanBytes = Uint8Array.from(atob(cleanImageBase64), (c) => c.charCodeAt(0));
					await supabase.storage.from('pottery-images').upload(cleanTempPath, cleanBytes, {
						contentType: 'image/jpeg',
						upsert: true
					});
					console.log('[analyze-pending] background removal complete');
				} catch (err) {
					console.warn('[analyze-pending] background removal failed (non-fatal):', err);
					// cleanImageBase64 stays as imageBase64; nothing uploaded so next retry will try again
				}
			}
		}

		await setStatus(uploadId, 'analyzing');

		// Build Deno IO adapter
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
			}
		};

		const strategy = new ThumbnailStrategy(denoIO);
		const embedding = await generateEmbedding(geminiKey, cleanImageBase64);

		let result: MatchResult;

		// Find nearest candidates via pgvector
		const { data: matches } = await supabase.rpc('match_pieces', {
			query_embedding: JSON.stringify(embedding),
			match_user_id: userId,
			match_count: 8
		});

		const candidates: MatchPieceRow[] = matches ?? [];

		const diag: Record<string, unknown> = {
			strategy: strategy.name,
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
			const coverImageIds = candidates.map((c) => c.cover_image_id).filter(Boolean) as string[];

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
			const { base64: newBase64, depthBase64: newDepthBase64 } =
				await strategy.prepareNewImage(cleanImageBase64);
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
		const finalStatus = batchId ? 'waiting_for_batch' : 'ready';
		await supabase
			.from('pending_uploads')
			.update({
				status: finalStatus,
				matched_piece_id: result.matchedPieceId,
				confidence: result.confidence,
				claude_reasoning: result.reasoning,
				suggested_name: result.suggestedName,
				updated_description: result.updatedDescription,
				embedding: JSON.stringify(embedding),
				analyze_attempts: currentAttempts,
				analyze_next_attempt_at: null,
				analyze_locked_at: null,
				analyze_last_error: null
			})
			.eq('id', uploadId);

		// For batch uploads: upsert a pending_batches row with consolidate_next_attempt_at = now().
		// The tick will pick it up and run consolidation within ≤1 minute.
		if (batchId) {
			await supabase.from('pending_batches').upsert(
				{
					batch_id: batchId,
					user_id: userId,
					consolidate_next_attempt_at: new Date().toISOString()
				},
				{ onConflict: 'batch_id', ignoreDuplicates: false }
			);
		}

		return new Response(JSON.stringify({ ok: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		console.error('analyze-pending error:', err);

		const attempts = currentAttempts + 1;
		const transient = isTransientError(err);

		if (transient && attempts < MAX_ANALYZE_ATTEMPTS) {
			// Retry: schedule the next attempt with exponential backoff
			const backoffSec = nextBackoff(attempts);
			const nextAttempt = new Date(Date.now() + backoffSec * 1000).toISOString();
			const errMsg = err instanceof Error ? err.message : String(err);

			await supabase
				.from('pending_uploads')
				.update({
					status: 'queued',
					analyze_attempts: attempts,
					analyze_next_attempt_at: nextAttempt,
					analyze_locked_at: null,
					analyze_last_error: errMsg
				})
				.eq('id', uploadId);

			console.log(
				`[analyze-pending] transient error, attempt ${attempts}/${MAX_ANALYZE_ATTEMPTS}, retry in ${backoffSec}s`
			);
		} else {
			// Permanent failure or exhausted retries
			const errMsg = err instanceof Error ? err.message : String(err);
			await supabase
				.from('pending_uploads')
				.update({
					status: 'failed',
					analyze_attempts: attempts,
					analyze_locked_at: null,
					analyze_last_error: errMsg
				})
				.eq('id', uploadId);
		}

		return new Response(JSON.stringify({ error: String(err) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
});
