import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';
import { getSignedUrls } from '$lib/server/storage';
import type { GlazeInspirationWithUrl } from '$lib/types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) error(401, 'Unauthorized');

	const supabase = createServiceRoleClient();
	const { data, error: dbError } = await supabase
		.from('glaze_inspirations')
		.select('id, user_id, name, storage_path, created_at')
		.eq('user_id', user.id)
		.order('created_at', { ascending: false });

	if (dbError) error(500, `Failed to load glaze inspirations: ${dbError.message}`);

	const rows = data ?? [];
	const signedUrls = await getSignedUrls(rows.map((r) => r.storage_path));

	const inspirations: GlazeInspirationWithUrl[] = rows.map((r) => ({
		...r,
		url: signedUrls.get(r.storage_path) ?? ''
	}));

	return { inspirations };
};
