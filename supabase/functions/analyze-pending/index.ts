import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MATCH_MODEL = 'claude-sonnet-4-6';

const MATCH_SYSTEM_PROMPT = `You are an expert pottery analyst helping potters track their ceramic pieces over time.
Your task is to determine whether a new photo shows an existing piece or a new one.

When analyzing pottery, focus on:
- Overall shape and form type (bowl, vase, mug, plate, etc.)
- Rim profile and foot ring details
- Surface texture and clay body characteristics
- Glaze color, finish, and distinctive drip patterns
- Any unique marks, stamps, handles, or decorative elements
- Size proportions relative to other objects if visible

IMPORTANT: Pottery changes appearance dramatically across stages:
- Greenware (raw clay): matte grey/brown, rough texture
- Bisqueware: lighter, chalky, still matte
- Glazed/fired: glassy, colorful, final form

A match across stages is valid if the underlying shape and distinctive features align.

CRITICAL: You must respond with ONLY valid JSON, no other text before or after.
Return this exact structure:
{
  "matchedPieceId": "<uuid string or null if no match>",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation of your decision>",
  "suggestedName": "<suggested name if new piece, empty string if matched>",
  "updatedDescription": "<dense visual fingerprint for future matching: shape, form, texture, glaze, distinctive features>"
}

Rules:
- Set matchedPieceId to null when confidence < 0.60 (treat as new piece)
- Confidence 0.60-0.79: possible match, note uncertainty in reasoning
- Confidence 0.80+: confident match
- updatedDescription should be 2-4 sentences covering all visually distinctive features`;

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

function parseClaudeJson(text: string): MatchResult {
	const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
	try {
		const parsed = JSON.parse(cleaned);
		return {
			matchedPieceId: parsed.matchedPieceId ?? null,
			confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
			reasoning: parsed.reasoning ?? '',
			suggestedName: parsed.suggestedName ?? '',
			updatedDescription: parsed.updatedDescription ?? ''
		};
	} catch {
		return {
			matchedPieceId: null,
			confidence: 0,
			reasoning: 'Failed to parse Claude response',
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
	const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;

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
		const imageMediaType = 'image/jpeg';

		// Fetch existing pieces for this user
		const { data: pieces } = await supabase
			.from('pieces')
			.select('id, name, ai_description')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		const existingPieces: ExistingPiece[] = pieces ?? [];

		let result: MatchResult;

		if (existingPieces.length === 0) {
			// No pieces to match — just get a description via Haiku
			const descResp = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': anthropicKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify({
					model: 'claude-haiku-4-5-20251001',
					max_tokens: 256,
					messages: [
						{
							role: 'user',
							content: [
								{
									type: 'image',
									source: { type: 'base64', media_type: imageMediaType, data: imageBase64 }
								},
								{
									type: 'text',
									text: 'Describe this pottery piece in 2-4 sentences focusing on: form type, shape details, texture, glaze/surface treatment, color, and any distinctive markings. Be specific enough that future photos of the same piece (possibly at different stages: greenware, bisque, or glazed) could be matched to this description. Return only the description text.'
								}
							]
						}
					]
				})
			});

			const descData = await descResp.json();
			const description =
				descData.content?.[0]?.type === 'text' ? descData.content[0].text : '';

			result = {
				matchedPieceId: null,
				confidence: 0,
				reasoning: 'No existing pieces to match against.',
				suggestedName: 'New Piece',
				updatedDescription: description
			};
		} else {
			const piecesText = existingPieces
				.map(
					(p: ExistingPiece, i: number) =>
						`${i + 1}. ID: ${p.id}\n   Name: ${p.name}\n   Description: ${p.ai_description ?? 'No description yet'}`
				)
				.join('\n\n');

			const matchResp = await fetch('https://api.anthropic.com/v1/messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': anthropicKey,
					'anthropic-version': '2023-06-01'
				},
				body: JSON.stringify({
					model: MATCH_MODEL,
					max_tokens: 512,
					system: MATCH_SYSTEM_PROMPT,
					messages: [
						{
							role: 'user',
							content: [
								{ type: 'text', text: 'Here is the new pottery photo to analyze:' },
								{
									type: 'image',
									source: { type: 'base64', media_type: imageMediaType, data: imageBase64 }
								},
								{
									type: 'text',
									text: `\nExisting pieces (match against their text descriptions):\n${piecesText}\n\nDoes the new photo match any existing piece? Return only JSON.`
								}
							]
						}
					]
				})
			});

			const matchData = await matchResp.json();
			const text = matchData.content?.[0]?.type === 'text' ? matchData.content[0].text : '';
			result = parseClaudeJson(text);

			// Validate matchedPieceId is actually in our list
			if (result.matchedPieceId) {
				const exists = existingPieces.some((p: ExistingPiece) => p.id === result.matchedPieceId);
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
