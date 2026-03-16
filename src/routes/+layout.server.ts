import type { LayoutServerLoad } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';

export const load: LayoutServerLoad = async ({ locals: { safeGetSession }, depends }) => {
	depends('app:review');
	const { session, user } = await safeGetSession();

	let pendingCount = 0;
	if (session && user) {
		try {
			const supabase = createServiceRoleClient();
			const { count } = await supabase
				.from('pending_uploads')
				.select('id', { count: 'exact', head: true })
				.eq('user_id', user.id)
				.in('status', ['queued', 'ready']);
			pendingCount = count ?? 0;
		} catch {
			// Non-fatal
		}
	}

	return { session, user, pendingCount };
};
