import "@supabase/ssr";
import "clsx";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/state.svelte.js";
const load = async ({ data, depends }) => {
  depends("supabase:auth");
  const supabase = null;
  return { supabase, session: data.session, user: data.user };
};
export {
  load
};
