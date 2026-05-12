"use client";

import Link from "next/link";
import type { CollectionDefinition } from "@/lib/collections/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Archive, RotateCcw, Trash2, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface CollectionIndexProps {
  collections: CollectionDefinition[];
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export function CollectionIndex({
  collections,
  onArchive,
  onRestore,
  onDelete,
}: CollectionIndexProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {collections.map((col) => (
        <div
          key={col.id}
          className={cn(
            "group relative rounded-lg border border-border/60 bg-background p-3 transition-colors hover:border-border",
            col.archived_at && "opacity-60",
          )}
        >
          <Link
            href={`/dashboard/collections/${col.slug}`}
            className="absolute inset-0 rounded-lg"
          />
          <div className="flex items-start gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md text-sm shrink-0"
              style={{ backgroundColor: (col.color ?? "#6b7280") + "20", color: col.color ?? "#6b7280" }}
            >
              {col.icon ?? <Database className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-heading truncate">{col.name}</span>
                {col.archived_at && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                    Archived
                  </span>
                )}
              </div>
              <div className="text-body text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                {col.record_count != null && (
                  <span className="text-[11px]">
                    {col.record_count} record{col.record_count !== 1 ? "s" : ""}
                  </span>
                )}
                {col.updated_at && col.record_count != null && (
                  <span className="text-muted-foreground/40">·</span>
                )}
                {col.updated_at && (
                  <span className="text-[11px] text-muted-foreground/60">
                    {formatDistanceToNow(new Date(col.updated_at), { addSuffix: true })}
                  </span>
                )}
              </div>
              {col.description && (
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                  {col.description}
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative z-10 h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {col.archived_at ? (
                  <DropdownMenuItem onClick={() => onRestore(col.id)}>
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                    Restore
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onArchive(col.id)}>
                    <Archive className="mr-2 h-3.5 w-3.5" />
                    Archive
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(col.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
