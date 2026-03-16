import { a as getSignedUrls } from "../../chunks/storage.js";
import { error } from "@sveltejs/kit";
import { c as createServiceRoleClient } from "../../chunks/supabase.js";
const load = async ({ locals: { safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!user) error(401, "Unauthorized");
  const supabase = createServiceRoleClient();
  const { data: pieces, error: dbError } = await supabase.from("pieces").select("id, user_id, name, description, ai_description, created_at, updated_at, cover_image_id").eq("user_id", user.id).order("updated_at", { ascending: false });
  if (dbError) error(500, "Failed to load pieces");
  const coverImageIds = pieces.map((p) => p.cover_image_id).filter(Boolean);
  let coverPathMap = /* @__PURE__ */ new Map();
  if (coverImageIds.length > 0) {
    const { data: coverImages } = await supabase.from("images").select("id, storage_path").in("id", coverImageIds);
    if (coverImages) {
      for (const img of coverImages) {
        coverPathMap.set(img.id, img.storage_path);
      }
    }
  }
  const coverPaths = Array.from(coverPathMap.values());
  const signedUrls = await getSignedUrls(coverPaths);
  const piecesWithCovers = pieces.map((p) => {
    const storagePath = p.cover_image_id ? coverPathMap.get(p.cover_image_id) : void 0;
    return {
      ...p,
      description: p.description ?? null,
      ai_description: p.ai_description ?? null,
      cover_image_id: p.cover_image_id ?? null,
      cover_url: storagePath ? signedUrls.get(storagePath) ?? null : null
    };
  });
  return { pieces: piecesWithCovers };
};
export {
  load
};
