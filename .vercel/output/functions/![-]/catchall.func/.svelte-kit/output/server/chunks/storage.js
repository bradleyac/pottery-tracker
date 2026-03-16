import { c as createServiceRoleClient } from "./supabase.js";
const BUCKET = "pottery-images";
async function uploadImage(buffer, storagePath, contentType) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: false
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return storagePath;
}
async function getSignedUrl(storagePath, expiresIn = 3600) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
  return data.signedUrl;
}
async function getSignedUrls(storagePaths, expiresIn = 3600) {
  if (storagePaths.length === 0) return /* @__PURE__ */ new Map();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(storagePaths, expiresIn);
  if (error) throw new Error(`Failed to create signed URLs: ${error.message}`);
  const urlMap = /* @__PURE__ */ new Map();
  for (const item of data) {
    if (item.signedUrl && item.path) {
      urlMap.set(item.path, item.signedUrl);
    }
  }
  return urlMap;
}
async function deleteImage(storagePath) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}
function buildStoragePath(userId, pieceId, imageId) {
  return `${userId}/${pieceId}/${imageId}.jpg`;
}
export {
  getSignedUrls as a,
  buildStoragePath as b,
  deleteImage as d,
  getSignedUrl as g,
  uploadImage as u
};
