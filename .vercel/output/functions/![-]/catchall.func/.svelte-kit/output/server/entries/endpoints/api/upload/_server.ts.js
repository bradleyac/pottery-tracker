import { error, json } from "@sveltejs/kit";
import { m as matchImageToPieces } from "../../../../chunks/claude.js";
import { u as uploadImage } from "../../../../chunks/storage.js";
import { c as createServiceRoleClient } from "../../../../chunks/supabase.js";
import { randomUUID } from "crypto";
const POST = async ({ request, locals: { safeGetSession } }) => {
  const { session, user } = await safeGetSession();
  if (!session || !user) error(401, "Unauthorized");
  const formData = await request.formData();
  const file = formData.get("image");
  if (!file || !file.type.startsWith("image/")) {
    error(400, "No valid image file provided");
  }
  if (file.size > 10 * 1024 * 1024) {
    error(400, "Image must be under 10 MB");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mediaType = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) ? file.type : "image/jpeg";
  const tempId = randomUUID();
  const tempPath = `${user.id}/temp/${tempId}.jpg`;
  await uploadImage(buffer, tempPath, mediaType);
  const supabase = createServiceRoleClient();
  const { data: pieces } = await supabase.from("pieces").select("id, name, ai_description, cover_image_id").eq("user_id", user.id).order("created_at", { ascending: false });
  const coverImageIds = (pieces ?? []).map((p) => p.cover_image_id).filter(Boolean);
  const coverPathMap = /* @__PURE__ */ new Map();
  if (coverImageIds.length > 0) {
    const { data: coverImages } = await supabase.from("images").select("id, storage_path").in("id", coverImageIds);
    if (coverImages) {
      for (const img of coverImages) {
        coverPathMap.set(img.id, img.storage_path);
      }
    }
  }
  const existingPieces = (pieces ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    ai_description: p.ai_description ?? null,
    cover_storage_path: p.cover_image_id ? coverPathMap.get(p.cover_image_id) ?? null : null
  }));
  const matchResult = await matchImageToPieces(buffer, mediaType, existingPieces);
  const matchedPiece = matchResult.matchedPieceId ? existingPieces.find((p) => p.id === matchResult.matchedPieceId) : null;
  return json({
    tempPath,
    matchedPieceId: matchResult.matchedPieceId,
    matchedPieceName: matchedPiece?.name ?? null,
    confidence: matchResult.confidence,
    reasoning: matchResult.reasoning,
    suggestedName: matchResult.suggestedName,
    updatedDescription: matchResult.updatedDescription,
    pieces: existingPieces.map((p) => ({ id: p.id, name: p.name }))
  });
};
export {
  POST
};
