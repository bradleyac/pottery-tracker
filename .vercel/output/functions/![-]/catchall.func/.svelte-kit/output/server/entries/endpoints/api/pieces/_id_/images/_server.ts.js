import { error, json } from "@sveltejs/kit";
import { c as createServiceRoleClient } from "../../../../../../chunks/supabase.js";
import { b as buildStoragePath, u as uploadImage, d as deleteImage } from "../../../../../../chunks/storage.js";
import { d as describeNewPiece } from "../../../../../../chunks/claude.js";
import { randomUUID } from "crypto";
const POST = async ({
  request,
  params,
  locals: { safeGetSession }
}) => {
  const { session, user } = await safeGetSession();
  if (!session || !user) error(401, "Unauthorized");
  const pieceId = params.id;
  const body = await request.json();
  const { tempPath, notes, updatedDescription } = body;
  if (!tempPath) error(400, "tempPath is required");
  const supabase = createServiceRoleClient();
  const { data: piece, error: pieceError } = await supabase.from("pieces").select("id, user_id, cover_image_id").eq("id", pieceId).eq("user_id", user.id).single();
  if (pieceError || !piece) error(404, "Piece not found");
  const { data: downloadData, error: downloadError } = await supabase.storage.from("pottery-images").download(tempPath);
  if (downloadError || !downloadData) error(500, "Failed to read temp image");
  const buffer = Buffer.from(await downloadData.arrayBuffer());
  const imageId = randomUUID();
  const permanentPath = buildStoragePath(user.id, pieceId, imageId);
  await uploadImage(buffer, permanentPath, "image/jpeg");
  try {
    await deleteImage(tempPath);
  } catch {
  }
  const isFirstImage = !piece.cover_image_id;
  const { error: insertError } = await supabase.from("images").insert({
    id: imageId,
    piece_id: pieceId,
    user_id: user.id,
    storage_path: permanentPath,
    notes: notes ?? null,
    is_cover: isFirstImage
  });
  if (insertError) error(500, `Failed to save image: ${insertError.message}`);
  const updates = {};
  if (isFirstImage) {
    updates.cover_image_id = imageId;
  }
  let newDescription = updatedDescription ?? null;
  if (!newDescription) {
    try {
      newDescription = await describeNewPiece(buffer, "image/jpeg");
    } catch {
    }
  }
  if (newDescription) {
    updates.ai_description = newDescription;
  }
  if (Object.keys(updates).length > 0) {
    await supabase.from("pieces").update(updates).eq("id", pieceId);
  }
  return json({ imageId, pieceId });
};
export {
  POST
};
