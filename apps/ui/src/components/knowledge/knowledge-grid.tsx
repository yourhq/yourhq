"use client";

import type { KnowledgeItem } from "@/lib/knowledge/types";
import { KnowledgeKindBadge } from "./knowledge-kind-badge";
import { EmbeddingStatus } from "./embedding-status";
import { MoreHorizontal, Archive, RotateCcw, Trash2, Pin, Loader2, AlertCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

interface KnowledgeGridProps {
  items: KnowledgeItem[];
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  showArchived: boolean;
}

export function KnowledgeGrid({
  items,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
}: KnowledgeGridProps) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 p-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="group relative rounded-lg border border-border/50 bg-card p-3 hover:border-border transition-colors"
        >
          <Link href={`/dashboard/knowledge/${item.id}`} className="block space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {item.icon && (
                  <span className="text-base leading-none shrink-0">
                    {item.icon}
                  </span>
                )}
                <span className="text-sm font-medium truncate">
                  {item.title}
                </span>
                {item.pinned && (
                  <Pin className="h-3 w-3 text-amber-400 shrink-0" />
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-accent"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36" onClick={(e) => e.stopPropagation()}>
                  {showArchived ? (
                    <>
                      <DropdownMenuItem onClick={() => onRestore(item.id)}>
                        <RotateCcw className="h-3.5 w-3.5 mr-2" />
                        Restore
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(item.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem onClick={() => onArchive(item.id)}>
                      <Archive className="h-3.5 w-3.5 mr-2" />
                      Archive
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2">
              <KnowledgeKindBadge kind={item.kind} />
              {item.kind === "file" && item.processing_status === "processing" && (
                <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />
              )}
              {item.kind === "file" && item.processing_status === "failed" && (
                <AlertCircle className="h-3 w-3 text-red-400" />
              )}
              {(item.kind === "page" || item.kind === "skill" || (item.kind === "file" && item.processing_status === "done")) && (
                <EmbeddingStatus
                  embeddingStatus={item.embedding_status}
                  chunkStatus={item.chunk_status}
                />
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
              <span>{new Date(item.updated_at).toLocaleDateString()}</span>
              {item.folder && <span className="truncate">{item.folder.name}</span>}
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}
