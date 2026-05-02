"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Document } from "@/lib/documents/types";
import { getBootTags, getBootLabel } from "@/lib/documents/boot-tags";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmbeddingStatus } from "./embedding-status";
import { FileText, Pin, Archive, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface DocumentGridProps {
  documents: Document[];
  loading: boolean;
  hasFilters?: boolean;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  showArchived?: boolean;
  agentMap: Record<string, string>;
}

export function DocumentGrid({
  documents,
  loading,
  hasFilters,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
  agentMap,
}: DocumentGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-[140px] rounded-lg bg-muted/20 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={hasFilters ? "No matching documents" : "No documents yet"}
        description={
          hasFilters
            ? "Try adjusting your search or folder filter."
            : "Create a document to get started."
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          doc={doc}
          agentMap={agentMap}
          showArchived={showArchived}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

interface DocumentCardProps {
  doc: Document;
  agentMap: Record<string, string>;
  showArchived?: boolean;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function DocumentCard({
  doc,
  agentMap,
  showArchived,
  onArchive,
  onRestore,
  onDelete,
}: DocumentCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-document-${doc.id}`,
    data: { type: "document", documentId: doc.id },
  });

  const bootTags = getBootTags(doc.tags);

  // Extract a text preview from the Tiptap JSON content
  const preview = (() => {
    if (!doc.content) return null;
    try {
      const parsed = JSON.parse(doc.content);
      const texts: string[] = [];
      function walk(node: Record<string, unknown>) {
        if (node.text && typeof node.text === "string") {
          texts.push(node.text);
        }
        if (Array.isArray(node.content)) {
          for (const child of node.content) walk(child as Record<string, unknown>);
        }
      }
      walk(parsed);
      return texts.join(" ").slice(0, 200) || null;
    } catch {
      return null;
    }
  })();

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex flex-col rounded-lg border border-border/50 bg-card/60 transition-colors hover:border-border hover:bg-accent/20",
        isDragging && "opacity-50"
      )}
    >
      <Link
        href={`/dashboard/documents/${doc.id}`}
        className="flex flex-1 flex-col p-4"
      >
        {/* Header: icon + title */}
        <div className="flex items-start gap-2.5 mb-2">
          <span className="text-lg shrink-0 mt-0.5">
            {doc.icon || "📄"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-foreground leading-snug line-clamp-2">
              {doc.title}
            </p>
            {doc.folder && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                {doc.folder.name}
              </p>
            )}
          </div>
          {doc.pinned && (
            <Pin className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          )}
        </div>

        {/* Content preview */}
        {preview && (
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-3 mb-3">
            {preview}
          </p>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer: tags + timestamp */}
        <div className="flex items-center gap-1.5 mt-2">
          <EmbeddingStatus document={doc} />
          {bootTags.length > 0 && (
            <>
              {bootTags.slice(0, 2).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="h-4 px-1.5 text-[9px] bg-purple-500/15 text-purple-400 border border-purple-500/20"
                >
                  {getBootLabel(tag, agentMap)}
                </Badge>
              ))}
              {bootTags.length > 2 && (
                <span className="text-[9px] text-muted-foreground">
                  +{bootTags.length - 2}
                </span>
              )}
            </>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground/50">
            {formatDistanceToNow(new Date(doc.updated_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      </Link>

      {/* Hover actions */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {showArchived ? (
          <>
            {onRestore && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-foreground"
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
                className="h-6 w-6 bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.preventDefault();
                  onDelete(doc.id);
                }}
                title="Delete permanently"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </>
        ) : onArchive ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-foreground"
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
    </div>
  );
}
