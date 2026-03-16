import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session } = await safeGetSession();
	if (session) redirect(303, '/');
	return {};
};

export const actions: Actions = {
	login: async ({ request, locals: { supabase } }) => {
		const data = await request.formData();
		const email = data.get('email') as string;
		const password = data.get('password') as string;

		if (!email || !password) {
			return fail(400, { message: 'Email and password are required', email });
		}

		const { error } = await supabase.auth.signInWithPassword({ email, password });

		if (error) {
			return fail(400, { message: error.message, email });
		}

		redirect(303, '/');
	},

	signup: async ({ request, locals: { supabase } }) => {
		const data = await request.formData();
		const email = data.get('email') as string;
		const password = data.get('password') as string;

		if (!email || !password) {
			return fail(400, { message: 'Email and password are required', email });
		}

		if (password.length < 8) {
			return fail(400, { message: 'Password must be at least 8 characters', email });
		}

		const { error } = await supabase.auth.signUp({
			email,
			password,
			options: {
				emailRedirectTo: `${process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173'}/auth/callback`
			}
		});

		if (error) {
			return fail(400, { message: error.message, email });
		}

		return { success: true, message: 'Check your email to confirm your account.' };
	},

	logout: async ({ locals: { supabase } }) => {
		await supabase.auth.signOut();
		redirect(303, '/auth');
	}
};
