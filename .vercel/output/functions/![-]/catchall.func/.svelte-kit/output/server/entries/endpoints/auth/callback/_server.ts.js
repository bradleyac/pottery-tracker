import { redirect } from "@sveltejs/kit";
const GET = async ({ url, locals: { supabase } }) => {
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(303, next);
    }
  }
  redirect(303, "/auth?error=auth_callback_failed");
};
export {
  GET
};
