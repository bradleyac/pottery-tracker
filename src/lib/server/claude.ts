import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import type { ClaudeMatchResult } from '$lib/types';
import { env } from '$env/dynamic/private';

// Sonnet for matching (needs vision + reasoning)
// Haiku for descriptions (simple task, ~10x cheaper)
const MATCH_MODEL = 'claude-sonnet-4-6';
const DESCRIBE_MODEL = 'claude-haiku-4-5-20251001';

function getClient() {
	return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

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

export type ExistingPiece = {
	id: string;
	name: string;
	ai_description: string | null;
	cover_storage_path?: string | null;
};

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

// Resize to at most 1024px on the longest side before sending to Claude.
// Originals are stored at full resolution; only the API payload is shrunk.
// A typical phone photo at 4000px costs ~4000 tokens; at 1024px it's ~400.
async function resizeForClaude(buffer: Buffer): Promise<{ data: string; mediaType: 'image/jpeg' }> {
	const resized = await sharp(buffer)
		.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 82 })
		.toBuffer();
	return { data: resized.toString('base64'), mediaType: 'image/jpeg' };
}

export async function matchImageToPieces(
	imageBuffer: Buffer,
	mediaType: ImageMediaType,
	existingPieces: ExistingPiece[]
): Promise<ClaudeMatchResult> {
	// No existing pieces → skip Claude entirely, just describe
	if (existingPieces.length === 0) {
		const description = await describeNewPiece(imageBuffer, mediaType);
		return {
			matchedPieceId: null,
			confidence: 0,
			reasoning: 'No existing pieces to match against.',
			suggestedName: 'New Piece',
			updatedDescription: description
		};
	}

	const piecesText = existingPieces
		.map(
			(p, i) =>
				`${i + 1}. ID: ${p.id}\n   Name: ${p.name}\n   Description: ${p.ai_description ?? 'No description yet'}`
		)
		.join('\n\n');

	const { data: base64Image, mediaType: resizedType } = await resizeForClaude(imageBuffer);

	const userContent: Anthropic.MessageParam['content'] = [
		{
			type: 'text',
			text: `Here is the new pottery photo to analyze:`
		},
		{
			type: 'image',
			source: { type: 'base64', media_type: resizedType, data: base64Image }
		},
		{
			type: 'text',
			text: `\nExisting pieces (match against their text descriptions):\n${piecesText}\n\nDoes the new photo match any existing piece? Return only JSON.`
		}
	];

	const response = await getClient().messages.create({
		model: MATCH_MODEL,
		max_tokens: 512,
		system: MATCH_SYSTEM_PROMPT,
		messages: [{ role: 'user', content: userContent }]
	});

	const text = response.content[0].type === 'text' ? response.content[0].text : '';
	const result = parseClaudeJson(text);

	// Validate matchedPieceId is actually in our list
	if (result.matchedPieceId) {
		const exists = existingPieces.some((p) => p.id === result.matchedPieceId);
		if (!exists) {
			result.matchedPieceId = null;
			result.confidence = 0;
		}
	}

	return result;
}

export async function describeNewPiece(
	imageBuffer: Buffer,
	_mediaType?: ImageMediaType
): Promise<string> {
	const { data: base64Image, mediaType: resizedType } = await resizeForClaude(imageBuffer);

	const response = await getClient().messages.create({
		model: DESCRIBE_MODEL,
		max_tokens: 256,
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'image',
						source: { type: 'base64', media_type: resizedType, data: base64Image }
					},
					{
						type: 'text',
						text: `Describe this pottery piece in 2-4 sentences focusing on: form type, shape details, texture, glaze/surface treatment, color, and any distinctive markings. Be specific enough that future photos of the same piece (possibly at different stages: greenware, bisque, or glazed) could be matched to this description. Return only the description text.`
					}
				]
			}
		]
	});

	return response.content[0].type === 'text' ? response.content[0].text : '';
}

function parseClaudeJson(text: string): ClaudeMatchResult {
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
