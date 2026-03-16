import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import type { Database } from '$lib/types';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createSupabaseServerClient(event: RequestEvent) {
	return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
		cookies: {
			getAll() {
				return event.cookies.getAll();
			},
			setAll(cookiesToSet: Array<{ name: string; value: string; options: Parameters<typeof event.cookies.set>[2] }>) {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});
}

// Service-role client for server-side operations (storage, admin queries)
export function createServiceRoleClient() {
	return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}
