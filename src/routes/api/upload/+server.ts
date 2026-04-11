import { removeBackground } from '$lib/server/bgremove';
import { describeNewPiece, generateImageEmbedding, matchImageToPieces } from '$lib/server/claude';
import {
	getCandidatesByEmbedding,
	getExistingPiecesForMatching,
	getPieceCoverUrls
} from '$lib/server/pieces';
import { uploadImage } from '$lib/server/storage';
import { getMatchingStrategy } from '$lib/server/strategies';
import { error, json } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const formData = await request.formData();
	const file = formData.get('image') as File | null;

	if (!file || !file.type.startsWith('image/')) {
		error(400, 'No valid image file provided');
	}

	if (file.size > 10 * 1024 * 1024) {
		error(400, 'Image must be under 10 MB');
	}

	const rawBuffer = Buffer.from(await file.arrayBuffer());

	// Resize to 1024px (matching bulk-upload) so all stored images are consistently small
	const buffer = await sharp(rawBuffer)
		.rotate() // auto-orient from EXIF before resizing
		.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 82 })
		.toBuffer();

	// Upload to a temp path first (no piece assigned yet)
	const tempId = randomUUID();
	const tempPath = `${user.id}/temp/${tempId}.jpg`;

	await uploadImage(buffer, tempPath, 'image/jpeg');

	// Remove background for cleaner embedding and matching — fall back to original on failure
	const cleanTempPath = `${user.id}/temp/clean_${tempId}.jpg`;
	const cleanBuffer = await removeBackground(buffer).catch(() => buffer);
	await uploadImage(cleanBuffer, cleanTempPath, 'image/jpeg').catch(() => { });

	// Get all pieces (for UI dropdown) and cover paths (for signed URLs)
	const { existingPieces, coverPathMap } = await getExistingPiecesForMatching(user.id);

	const diag: Record<string, unknown> = {};
	let matchResult;

	if (existingPieces.length === 0) {
		diag.step = 'no_pieces';
		const description = await describeNewPiece(buffer, 'image/jpeg');
		matchResult = {
			matchedPieceId: null,
			confidence: 0,
			reasoning: 'No existing pieces to match against.',
			suggestedName: 'New Piece',
			updatedDescription: description
		};
	} else {
		const strategy = await getMatchingStrategy();
		const [embedding, description] = await Promise.all([
			generateImageEmbedding(cleanBuffer),
			describeNewPiece(buffer, 'image/jpeg')
		]);

		const candidates = await getCandidatesByEmbedding(user.id, embedding);

		diag.strategy = strategy.name;
		diag.candidatesFound = candidates.length;
		diag.candidateNames = candidates.map((c) => c.name);

		console.log('[upload] diagnostics:', JSON.stringify(diag));

		if (candidates.length === 0) {
			diag.step = 'no_candidates';
			matchResult = {
				matchedPieceId: null,
				confidence: 0,
				reasoning: 'No candidate pieces with embeddings to match against.',
				suggestedName: 'New Piece',
				updatedDescription: description
			};
		} else {
			diag.step = 'gemini_comparison';
			matchResult = await matchImageToPieces(cleanBuffer, 'image/jpeg', candidates, strategy);
			if (!matchResult.updatedDescription) {
				matchResult.updatedDescription = description;
			}
		}
	}

	const coverUrlMap = await getPieceCoverUrls(existingPieces, coverPathMap);

	const matchedPiece = matchResult.matchedPieceId
		? existingPieces.find((p) => p.id === matchResult.matchedPieceId)
		: null;

	const matchedPieceCoverUrl =
		matchedPiece?.cover_storage_path
			? (coverUrlMap.get(matchedPiece.cover_storage_path) ?? null)
			: null;

	return json({
		tempPath,
		matchedPieceId: matchResult.matchedPieceId,
		matchedPieceName: matchedPiece?.name ?? null,
		matchedPieceCoverUrl,
		confidence: matchResult.confidence,
		reasoning: matchResult.reasoning,
		suggestedName: matchResult.suggestedName,
		updatedDescription: matchResult.updatedDescription,
		diagnostics: diag,
		pieces: existingPieces.map((p) => ({
			id: p.id,
			name: p.name,
			cover_url: p.cover_storage_path ? (coverUrlMap.get(p.cover_storage_path) ?? null) : null
		}))
	});
};
