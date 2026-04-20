import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetType } from "./types";

const BUCKET = "assets";

export async function uploadAssetFile(
  supabase: SupabaseClient,
  file: File,
  assetId: string
): Promise<string> {
  const path = `${assetId}/${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresIn = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteAssetFile(
  supabase: SupabaseClient,
  storagePath: string
): Promise<void> {
  await supabase.storage.from(BUCKET).remove([storagePath]);
}

export function inferAssetType(mimeType: string): AssetType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "document";
  if (
    mimeType.includes("spreadsheet") ||
    mimeType === "text/csv" ||
    mimeType.includes("excel")
  )
    return "spreadsheet";
  if (
    mimeType.includes("javascript") ||
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("html") ||
    mimeType === "text/plain"
  )
    return "script";
  return "other";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
