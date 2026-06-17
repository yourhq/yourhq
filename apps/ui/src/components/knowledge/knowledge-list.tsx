"use client";

import type { KnowledgeItem, KnowledgeChunkSearchResult } from "@/lib/knowledge/types";
import { KnowledgeKindBadge } from "./knowledge-kind-badge";
import { KnowledgeScopeBadge } from "./knowledge-scope-badge";
import { EmbeddingStatus } from "./embedding-status";
import { ProviderIcon } from "@/components/sources/provider-icon";
import { MoreHorizontal, Archive, RotateCcw, Trash2, Loader2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";

interface KnowledgeListProps {
  items: KnowledgeItem[];
  searchSnippets?: Record<string, KnowledgeChunkSearchResult[]>;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  showArchived: boolean;
}

export function KnowledgeList({
  items,
  searchSnippets,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
}: KnowledgeListProps) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-border/40">
      {items.map((item) => (
        <div
          key={item.id}
          className="group flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <Link
              href={`/dashboard/knowledge/${item.id}`}
              className="flex items-center gap-2"
            >
              {item.icon && (
                <span className="text-base leading-none shrink-0">
                  {item.icon}
                </span>
              )}
              <span className="text-sm font-medium truncate hover:underline">
                {item.title}
              </span>
            </Link>
            {searchSnippets?.[item.id]?.[0] && (
              <p className="text-[11px] text-muted-foreground/60 truncate ml-6 mt-0.5">
                {searchSnippets[item.id][0].content}
              </p>
            )}
          </div>

          {item.kind === "source" && item.source_connection_id ? (
            <SourceSyncInfo item={item} />
          ) : (
            <KnowledgeKindBadge kind={item.kind} />
          )}
          <KnowledgeScopeBadge scope={item.scope} />

          {item.kind === "file" && item.processing_status === "processing" && (
            <Loader2 className="h-3 w-3 text-status-info animate-spin shrink-0" />
          )}
          {item.kind === "file" && item.processing_status === "failed" && (
            <AlertCircle className="h-3 w-3 text-status-error shrink-0" />
          )}
          {(item.kind === "page" || item.kind === "skill" || item.kind === "source" || (item.kind === "file" && item.processing_status === "done")) && (
            <EmbeddingStatus
              embeddingStatus={item.embedding_status}
              chunkStatus={item.chunk_status}
            />
          )}

          {item.folder && (
            <span className="text-[10px] text-muted-foreground/60 truncate max-w-[100px] shrink-0">
              {item.folder.name}
            </span>
          )}

          <span className="text-[10px] text-muted-foreground/40 shrink-0">
            {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent">
                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
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
      ))}
    </div>
  );
}

function SourceSyncInfo({ item }: { item: KnowledgeItem }) {
  const provider = (item.meta as Record<string, unknown>)?.provider as string | undefined;

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
      {provider && <ProviderIcon provider={provider} className="h-3 w-3" />}
      {item.source_synced_at ? (
        <span>
          Synced{" "}
          {formatDistanceToNow(new Date(item.source_synced_at), {
            addSuffix: true,
          })}
        </span>
      ) : item.source_sync_status === "source_deleted" ? (
        <span className="text-status-error">Deleted in source</span>
      ) : item.source_sync_status === "error" ? (
        <span className="text-status-error">Sync failed</span>
      ) : (
        <span>Pending sync</span>
      )}
    </span>
  );
}
