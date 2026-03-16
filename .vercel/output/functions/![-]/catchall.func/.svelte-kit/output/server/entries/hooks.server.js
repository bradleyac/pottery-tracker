import { a as createSupabaseServerClient } from "../chunks/supabase.js";
import { redirect } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
const supabaseHandle = async ({ event, resolve }) => {
  event.locals.supabase = createSupabaseServerClient(event);
  event.locals.safeGetSession = async () => {
    const {
      data: { session }
    } = await event.locals.supabase.auth.getSession();
    if (!session) return { session: null, user: null };
    const {
      data: { user },
      error
    } = await event.locals.supabase.auth.getUser();
    if (error) return { session: null, user: null };
    return { session, user };
  };
  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === "content-range" || name === "x-supabase-api-version";
    }
  });
};
const authGuard = async ({ event, resolve }) => {
  const { session, user } = await event.locals.safeGetSession();
  const isAuthRoute = event.url.pathname.startsWith("/auth") || event.url.pathname.startsWith("/api");
  if (!session && !isAuthRoute) {
    redirect(303, "/auth");
  }
  if (session && user && event.url.pathname === "/auth") {
    redirect(303, "/");
  }
  return resolve(event);
};
const handle = sequence(supabaseHandle, authGuard);
export {
  handle
};
