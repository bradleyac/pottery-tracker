import { redirect, fail } from "@sveltejs/kit";
const load = async ({ locals: { safeGetSession } }) => {
  const { session } = await safeGetSession();
  if (session) redirect(303, "/");
  return {};
};
const actions = {
  login: async ({ request, locals: { supabase } }) => {
    const data = await request.formData();
    const email = data.get("email");
    const password = data.get("password");
    if (!email || !password) {
      return fail(400, { message: "Email and password are required", email });
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return fail(400, { message: error.message, email });
    }
    redirect(303, "/");
  },
  signup: async ({ request, locals: { supabase } }) => {
    const data = await request.formData();
    const email = data.get("email");
    const password = data.get("password");
    if (!email || !password) {
      return fail(400, { message: "Email and password are required", email });
    }
    if (password.length < 8) {
      return fail(400, { message: "Password must be at least 8 characters", email });
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.PUBLIC_SITE_URL ?? "http://localhost:5173"}/auth/callback`
      }
    });
    if (error) {
      return fail(400, { message: error.message, email });
    }
    return { success: true, message: "Check your email to confirm your account." };
  },
  logout: async ({ locals: { supabase } }) => {
    await supabase.auth.signOut();
    redirect(303, "/auth");
  }
};
export {
  actions,
  load
};
