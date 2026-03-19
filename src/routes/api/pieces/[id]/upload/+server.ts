import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addImageBufferToPiece } from '$lib/server/pieces';

export const POST: RequestHandler = async ({ request, params, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const pieceId = params.id;
	const formData = await request.formData();
	const file = formData.get('image');
	const notes = formData.get('notes');

	if (!(file instanceof File)) error(400, 'image is required');
	if (!file.type.startsWith('image/')) error(400, 'File must be an image');
	if (file.size > 10 * 1024 * 1024) error(400, 'Image must be under 10 MB');

	const buffer = Buffer.from(await file.arrayBuffer());

	try {
		const result = await addImageBufferToPiece(
			user.id,
			pieceId,
			buffer,
			file.type,
			typeof notes === 'string' ? notes : null
		);
		return json(result);
	} catch (err) {
		error(500, err instanceof Error ? err.message : 'Failed to upload image');
	}
};
