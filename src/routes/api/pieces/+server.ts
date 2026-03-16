import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPieceFromTemp } from '$lib/server/pieces';

// POST: create a new piece and attach the temp image to it
export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const body = await request.json();
	const { tempPath, name, notes, updatedDescription } = body as {
		tempPath: string;
		name: string;
		notes?: string;
		updatedDescription?: string;
	};

	if (!tempPath || !name?.trim()) {
		error(400, 'tempPath and name are required');
	}

	try {
		const result = await createPieceFromTemp(
			user.id,
			tempPath,
			name,
			notes ?? null,
			updatedDescription ?? null
		);
		return json(result);
	} catch (err) {
		error(500, err instanceof Error ? err.message : 'Failed to create piece');
	}
};
