"use client";

import type { Document } from "@/lib/documents/types";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function EmbeddingStatus({ document }: { document: Document }) {
  const status = document.embedding_status;
  if (status === "indexed") {
    return (
      <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        Search ready
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge
        variant="secondary"
        className="h-5 gap-1 px-1.5 text-[10px] text-red-400"
        title={document.embedding_error ?? "Indexing failed"}
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
