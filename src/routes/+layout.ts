import { browser } from '$app/environment';
import { invalidate } from '$app/navigation';
import { createSupabaseBrowserClient } from '$lib/client/supabase';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends }) => {
	depends('supabase:auth');

	const supabase = browser ? createSupabaseBrowserClient() : null;

	if (browser && supabase) {
		supabase.auth.onAuthStateChange((event) => {
			if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
				invalidate('supabase:auth');
			}
		});
	}

	return { supabase, session: data.session, user: data.user, pendingCount: data.pendingCount };
};
