import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addImageToExistingPiece } from '$lib/server/pieces';

// POST: attach a temp-uploaded image to an existing piece
export const POST: RequestHandler = async ({
	request,
	params,
	locals: { safeGetSession }
}) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const pieceId = params.id;
	const body = await request.json();
	const { tempPath, notes, updatedDescription } = body as {
		tempPath: string;
		notes?: string;
		updatedDescription?: string;
	};

	if (!tempPath) error(400, 'tempPath is required');

	try {
		const result = await addImageToExistingPiece(
			user.id,
			pieceId,
			tempPath,
			notes ?? null,
			updatedDescription ?? null
		);
		return json(result);
	} catch (err) {
		error(500, err instanceof Error ? err.message : 'Failed to save image');
	}
};
