import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { consolidateBatch } from '$lib/server/batch';

export const POST: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('Authorization');
	if (authHeader !== `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`) error(401, 'Unauthorized');

	const { batchId } = (await request.json()) as { batchId: string };
	if (!batchId) error(400, 'batchId required');

	await consolidateBatch(batchId);
	return json({ ok: true });
};
