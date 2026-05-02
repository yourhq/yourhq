"use client";

import type { Document } from "@/lib/documents/types";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function EmbeddingStatus({ document }: { document: Document }) {
  const chunkStatus = document.chunk_status;
  const embeddingStatus = document.embedding_status;
  if (chunkStatus === "indexed" && embeddingStatus === "indexed") {
    return (
      <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        Search ready
      </Badge>
    );
  }
  if (chunkStatus === "indexed") {
    return (
      <Badge
        variant="secondary"
        className="h-5 gap-1 px-1.5 text-[10px] text-amber-400"
        title={document.embedding_error ?? "Full-text search is ready; semantic search is still unavailable."}
      >
        <CheckCircle2 className="h-3 w-3" />
        Text ready
      </Badge>
    );
  }
  if (chunkStatus === "failed" || embeddingStatus === "failed") {
    return (
      <Badge
        variant="secondary"
        className="h-5 gap-1 px-1.5 text-[10px] text-red-400"
        title={document.chunk_error ?? document.embedding_error ?? "Indexing failed"}
      >
        <AlertCircle className="h-3 w-3" />
        Index failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      Indexing
    </Badge>
  );
}
