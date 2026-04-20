"use client";

import type { Asset } from "@/lib/assets/types";
import { ASSET_TYPE_COLORS } from "@/lib/assets/types";
import { cn } from "@/lib/utils";
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
  FileCode, Terminal, Table, ExternalLink, File,
  MoreHorizontal, Archive, RotateCcw, Trash2,
} from "lucide-react";
import { format } from "date-fns";

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

interface AssetCardProps {
  asset: Asset;
  onClick?: () => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  showArchived?: boolean;
}

export function AssetCard({ asset, onClick, onArchive, onRestore, onDelete, showArchived }: AssetCardProps) {
  const Icon = typeIcons[asset.type] || File;

  return (
    <div
      onClick={onClick}
      className="group border border-border/50 rounded p-2.5 space-y-1.5 cursor-pointer hover:border-border hover:bg-accent/30 transition-colors"
    >
      <div className="flex items-start gap-2">
        <div className={cn("rounded p-1.5 shrink-0", ASSET_TYPE_COLORS[asset.type])}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate leading-tight">{asset.name}</p>
          {asset.description && (
            <p className="text-xs text-muted-foreground truncate">{asset.description}</p>
          )}
        </div>
        {(onArchive || onRestore) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity -mt-0.5 -mr-1"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3 w-3" />
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

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded bg-muted", ASSET_TYPE_COLORS[asset.type])}>
          {asset.type}
        </span>
        <span>{format(new Date(asset.created_at), "MMM d")}</span>
      </div>

      {asset.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {asset.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{tag}</span>
          ))}
          {asset.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{asset.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}
