import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { matchImageToPieces, describeNewPiece, generateImageEmbedding } from '$lib/server/claude';
import { uploadImage } from '$lib/server/storage';
import {
	getExistingPiecesForMatching,
	getPieceCoverUrls,
	getCandidatesByEmbedding
} from '$lib/server/pieces';
import { randomUUID } from 'crypto';

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

	const buffer = Buffer.from(await file.arrayBuffer());
	const mediaType = (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
		? file.type
		: 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

	// Upload to a temp path first (no piece assigned yet)
	const tempId = randomUUID();
	const tempPath = `${user.id}/temp/${tempId}.jpg`;

	await uploadImage(buffer, tempPath, mediaType);

	// Get all pieces (for UI dropdown) and cover paths (for signed URLs)
	const { existingPieces, coverPathMap } = await getExistingPiecesForMatching(user.id);

	let matchResult;

	if (existingPieces.length === 0) {
		// No pieces to match — just describe
		const description = await describeNewPiece(buffer, mediaType);
		matchResult = {
			matchedPieceId: null,
			confidence: 0,
			reasoning: 'No existing pieces to match against.',
			suggestedName: 'New Piece',
			updatedDescription: description
		};
	} else {
		// Generate embedding and find candidates, describe in parallel
		const [embedding, description] = await Promise.all([
			generateImageEmbedding(buffer),
			describeNewPiece(buffer, mediaType)
		]);

		// Find nearest candidates by embedding similarity, download their cover images
		const candidates = await getCandidatesByEmbedding(user.id, embedding);

		if (candidates.length === 0) {
			// No candidates with embeddings — treat as new piece
			matchResult = {
				matchedPieceId: null,
				confidence: 0,
				reasoning: 'No candidate pieces with embeddings to match against.',
				suggestedName: 'New Piece',
				updatedDescription: description
			};
		} else {
			// Photo-to-photo comparison with candidate cover images
			matchResult = await matchImageToPieces(buffer, mediaType, candidates);
			// Use the describe result if matching didn't produce a description
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
		pieces: existingPieces.map((p) => ({
			id: p.id,
			name: p.name,
			cover_url: p.cover_storage_path ? (coverUrlMap.get(p.cover_storage_path) ?? null) : null
		}))
	});
};
