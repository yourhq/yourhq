import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Asset } from "@/lib/assets/types";
import { AssetViewer } from "@/components/assets/asset-viewer";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: asset } = await supabase
    .from("assets")
    .select("*, folder:asset_folders(id, name)")
    .eq("id", id)
    .single();

  if (!asset) notFound();

  // Generate signed URL for storage-backed files
  let signedFileUrl: string | null = null;
  const typedAsset = asset as unknown as Asset;
  if (typedAsset.file_url && typedAsset.type !== "link") {
    const { data } = await supabase.storage
      .from("assets")
      .createSignedUrl(typedAsset.file_url, 3600);
    signedFileUrl = data?.signedUrl ?? null;
  }

  return <AssetViewer asset={typedAsset} signedFileUrl={signedFileUrl} />;
}
