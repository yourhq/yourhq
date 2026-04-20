"use client";

import type { Asset } from "@/lib/assets/types";
import { ASSET_TYPE_COLORS } from "@/lib/assets/types";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/assets/storage";
import { ArrowLeft, Download } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { AssetEditor } from "./asset-editor";

interface AssetViewerProps {
  asset: Asset;
  signedFileUrl?: string | null;
}

export function AssetViewer({ asset, signedFileUrl }: AssetViewerProps) {
  const isTextAsset = ["document", "sop", "research", "template", "script"].includes(asset.type);
  const isImageAsset = asset.type === "image" && asset.file_url;
  const isLinkAsset = asset.type === "link";

  return (
    <div className="h-full overflow-auto px-4 py-5 sm:px-6 md:px-8">
      <div className="mx-auto max-w-4xl space-y-4">
      <Link
        href="/dashboard/assets"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Assets
      </Link>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">{asset.name}</h1>
            {asset.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{asset.description}</p>
            )}
          </div>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded bg-muted shrink-0", ASSET_TYPE_COLORS[asset.type])}>
            {asset.type}
          </span>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {asset.folder && <span>Folder: {asset.folder.name}</span>}
          <span>Created {format(new Date(asset.created_at), "MMM d, yyyy")}</span>
          {asset.file_size && (
            <span>{formatFileSize(asset.file_size)}</span>
          )}
        </div>

        {asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.tags.map((tag) => (
              <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{tag}</span>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border/50 pt-4">
        {isTextAsset && (
          <AssetEditor asset={asset} />
        )}

        {isImageAsset && signedFileUrl && (
          <div className="space-y-2">
            <div className="rounded border border-border/50 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={signedFileUrl} alt={asset.name} className="w-full" />
            </div>
            <a
              href={signedFileUrl}
              download={asset.name}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </div>
        )}

        {isLinkAsset && asset.file_url && (
          <a
            href={asset.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline"
          >
            {asset.file_url}
          </a>
        )}

        {!isTextAsset && !isImageAsset && !isLinkAsset && signedFileUrl && (
          <a
            href={signedFileUrl}
            download={asset.name}
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download file
          </a>
        )}
      </div>
      </div>
    </div>
  );
}
