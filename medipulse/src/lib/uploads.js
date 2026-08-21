import { supabase } from "./supabaseClient";

/* ------------------------------------------------------------------ */
/*  File uploads to private Supabase Storage buckets.                  */
/*                                                                     */
/*  Both buckets are private — nothing is ever served by public URL.   */
/*  Objects live under a folder named for the uploader's auth id, and  */
/*  the storage policies enforce that, so one patient can never write  */
/*  into (or read) another's folder. Display goes through short-lived  */
/*  signed URLs.                                                       */
/* ------------------------------------------------------------------ */

export const BUCKET_PAYMENT_PROOFS = "payment-proofs";
export const BUCKET_SIGNATURES = "consent-signatures";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

// Returns an error string, or null when the file is acceptable.
export function validateUpload(file) {
  if (!file) return "Pick a file first.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — please keep it under 5 MB.`;
  }
  if (!ALLOWED.includes(file.type)) {
    return "Please upload a photo (JPG, PNG, WEBP) or a PDF.";
  }
  return null;
}

// Strip anything that could confuse a storage path; keep it recognisable.
const safeName = (name) =>
  (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);

export async function uploadPrivate(bucket, userId, folder, file) {
  const path = `${userId}/${folder}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { error: error.message };
  return { path };
}

export async function uploadDataUrl(bucket, userId, folder, dataUrl, filename) {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${userId}/${folder}/${Date.now()}-${safeName(filename)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || "image/png",
    upsert: false,
  });
  if (error) return { error: error.message };
  return { path };
}

// Private buckets have no public URL — every view needs a signed one.
export async function signedUrl(bucket, path, seconds = 300) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (error) return null;
  return data?.signedUrl || null;
}
