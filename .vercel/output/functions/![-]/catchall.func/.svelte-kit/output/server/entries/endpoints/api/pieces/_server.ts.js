import { error, json } from "@sveltejs/kit";
import { c as createServiceRoleClient } from "../../../../chunks/supabase.js";
import { d as describeNewPiece } from "../../../../chunks/claude.js";
import { b as buildStoragePath, u as uploadImage, d as deleteImage } from "../../../../chunks/storage.js";
import { randomUUID } from "crypto";
const POST = async ({ request, locals: { safeGetSession } }) => {
  const { session, user } = await safeGetSession();
  if (!session || !user) error(401, "Unauthorized");
  const body = await request.json();
  const { tempPath, name, notes, updatedDescription } = body;
  if (!tempPath || !name?.trim()) {
    error(400, "tempPath and name are required");
  }
  const supabase = createServiceRoleClient();
  let aiDescription = updatedDescription ?? null;
  const pieceId = randomUUID();
  const { error: pieceError } = await supabase.from("pieces").insert({
    id: pieceId,
    user_id: user.id,
    name: name.trim(),
    ai_description: aiDescription
  });
  if (pieceError) error(500, `Failed to create piece: ${pieceError.message}`);
  const { data: downloadData, error: downloadError } = await supabase.storage.from("pottery-images").download(tempPath);
  if (downloadError || !downloadData) {
    error(500, "Failed to read temp image");
  }
  const buffer = Buffer.from(await downloadData.arrayBuffer());
  const imageId = randomUUID();
  const permanentPath = buildStoragePath(user.id, pieceId, imageId);
  await uploadImage(buffer, permanentPath, "image/jpeg");
  try {
    await deleteImage(tempPath);
  } catch {
  }
  if (!aiDescription) {
    try {
      aiDescription = await describeNewPiece(buffer, "image/jpeg");
    } catch {
    }
  }
  const { error: imageError } = await supabase.from("images").insert({
    id: imageId,
    piece_id: pieceId,
    user_id: user.id,
    storage_path: permanentPath,
    notes: notes ?? null,
    is_cover: true
  });
  if (imageError) error(500, `Failed to save image: ${imageError.message}`);
  await supabase.from("pieces").update({ cover_image_id: imageId, ai_description: aiDescription }).eq("id", pieceId);
  return json({ pieceId });
};
export {
  POST
};
