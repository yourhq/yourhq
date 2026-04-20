"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Asset } from "@/lib/assets/types";
import { ASSET_TYPE_COLORS } from "@/lib/assets/types";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText, ClipboardList, Search, Image, Video, Headphones,
  FileCode, Terminal, Table, ExternalLink, File, FolderOpen,
  MoreHorizontal, Archive, RotateCcw, Trash2,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, typeof File> = {
  document: FileText,
  sop: ClipboardList,
  research: Search,
  image: Image,
  video: Video,
  audio: Headphones,
  template: FileCode,
  script: Terminal,
  spreadsheet: Table,
  link: ExternalLink,
  other: File,
};

interface AssetListProps {
  assets: Asset[];
  loading: boolean;
  onSelect: (asset: Asset) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  showArchived?: boolean;
}

export function AssetList({
  assets,
  loading,
  onSelect,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
}: AssetListProps) {
  if (loading) {
    return <LoadingSkeleton variant="list" count={8} />;
  }

  if (assets.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No assets found"
        description="Create or upload an asset to get started."
      />
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {assets.map((asset) => (
        <AssetRow
          key={asset.id}
          asset={asset}
          onSelect={onSelect}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
          showArchived={showArchived}
        />
      ))}
    </div>
  );
}

interface AssetRowProps {
  asset: Asset;
  onSelect: (asset: Asset) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  showArchived?: boolean;
}

function AssetRow({
  asset,
  onSelect,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
}: AssetRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `assets-drag-asset-${asset.id}`,
    data: { type: "asset", assetId: asset.id },
  });
  const Icon = typeIcons[asset.type] || File;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/30",
        isDragging && "opacity-50"
      )}
    >
      <Link
        href={`/dashboard/assets/${asset.id}`}
        className="flex flex-1 items-center gap-3 min-w-0"
        onClick={() => onSelect(asset)}
      >
        {/* Type icon */}
        <div className={cn("rounded p-1.5 shrink-0", ASSET_TYPE_COLORS[asset.type])}>
          <Icon className="h-3.5 w-3.5" />
        </div>

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {asset.name}
          </p>
          {asset.description && (
            <p className="text-[11px] text-muted-foreground truncate">
              {asset.description}
            </p>
          )}
        </div>

        {/* Type badge */}
        <span className={cn("hidden shrink-0 text-[10px] px-1.5 py-0.5 rounded sm:inline-block", ASSET_TYPE_COLORS[asset.type])}>
          {asset.type}
        </span>

        {/* Tags */}
        {asset.tags.length > 0 && (
          <div className="hidden shrink-0 items-center gap-1 md:flex">
            {asset.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                {tag}
              </span>
            ))}
            {asset.tags.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{asset.tags.length - 2}</span>
            )}
          </div>
        )}

        {/* Folder */}
        {asset.folder && (
          <span className="hidden shrink-0 text-[11px] text-muted-foreground/60 md:inline-block">
            {asset.folder.name}
          </span>
        )}

        {/* Timestamp */}
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(asset.updated_at), { addSuffix: true })}
        </span>
      </Link>

      {/* Row actions */}
      {(onArchive || onRestore) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {showArchived ? (
              <>
                {onRestore && (
                  <DropdownMenuItem onClick={() => onRestore(asset.id)}>
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                    Restore
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(asset.id)}>
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete permanently
                    </DropdownMenuItem>
                  </>
                )}
              </>
            ) : (
              onArchive && (
                <DropdownMenuItem onClick={() => onArchive(asset.id)}>
                  <Archive className="mr-2 h-3.5 w-3.5" />
                  Archive
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
