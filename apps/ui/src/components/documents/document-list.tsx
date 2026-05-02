"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Document, KnowledgeChunkSearchResult } from "@/lib/documents/types";
import { getBootTags, getBootLabel } from "@/lib/documents/boot-tags";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmbeddingStatus } from "./embedding-status";
import { FileText, Pin, Archive, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface DocumentListProps {
  documents: Document[];
  loading: boolean;
  hasFilters?: boolean;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  showArchived?: boolean;
  agentMap: Record<string, string>;
  snippetsByDocument?: Record<string, KnowledgeChunkSearchResult[]>;
}

export function DocumentList({ documents, loading, hasFilters, onArchive, onRestore, onDelete, showArchived, agentMap, snippetsByDocument }: DocumentListProps) {
  if (loading) {
    return <LoadingSkeleton variant="list" count={8} />;
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={hasFilters ? "No matching documents" : "No documents yet"}
        description={hasFilters ? "Try adjusting your search or folder filter." : "Create a document to get started."}
      />
    );
  }

  return (
    <div>
      {documents.map((doc) => (
        <DocumentRow
          key={doc.id}
          doc={doc}
          agentMap={agentMap}
          snippets={snippetsByDocument?.[doc.id]}
          showArchived={showArchived}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

interface DocumentRowProps {
  doc: Document;
  agentMap: Record<string, string>;
  snippets?: KnowledgeChunkSearchResult[];
  showArchived?: boolean;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function DocumentRow({
  doc,
  agentMap,
  snippets,
  showArchived,
  onArchive,
  onRestore,
  onDelete,
}: DocumentRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-document-${doc.id}`,
    data: { type: "document", documentId: doc.id },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group flex items-center gap-3 border-b border-border/30 px-3 py-2.5 transition-colors hover:bg-accent/30",
        isDragging && "opacity-50"
      )}
    >
          <Link
            href={`/dashboard/documents/${doc.id}`}
            className="flex flex-1 items-center gap-3 min-w-0"
          >
            <span className="text-base shrink-0">
              {doc.icon || "📄"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {doc.title}
              </p>
              {doc.folder && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {doc.folder.name}
                </p>
              )}
              {snippets?.[0] && (
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {snippets[0].content}
                </p>
              )}
            </div>
            {getBootTags(doc.tags).length > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                {getBootTags(doc.tags).map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="h-4 px-1.5 text-[10px] bg-purple-500/15 text-purple-400 border border-purple-500/20"
                  >
                    {getBootLabel(tag, agentMap)}
                  </Badge>
                ))}
              </div>
            )}
            {doc.pinned && (
              <Pin className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <EmbeddingStatus document={doc} />
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true })}
            </span>
          </Link>
          {showArchived ? (
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {onRestore && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    onRestore(doc.id);
                  }}
                  title="Restore"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    onDelete(doc.id);
                  }}
                  title="Delete permanently"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ) : onArchive ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
              onClick={(e) => {
                e.preventDefault();
                onArchive(doc.id);
              }}
              title="Archive"
            >
              <Archive className="h-3 w-3" />
            </Button>
          ) : null}
    </div>
  );
}
