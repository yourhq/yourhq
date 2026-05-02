"use client";

import { CheckCircle2, AlertCircle, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmbeddingStatusProps {
  embeddingStatus: string;
  chunkStatus: string;
  className?: string;
}

export function EmbeddingStatus({
  embeddingStatus,
  chunkStatus,
  className,
}: EmbeddingStatusProps) {
  if (embeddingStatus === "indexed" && chunkStatus === "indexed") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[10px] text-emerald-400", className)}>
        <Search className="h-3 w-3" />
        Search ready
      </span>
    );
  }

  if (chunkStatus === "indexed") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[10px] text-amber-400", className)}>
        <CheckCircle2 className="h-3 w-3" />
        Text ready
      </span>
    );
  }

  if (embeddingStatus === "failed" || chunkStatus === "failed") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[10px] text-red-400", className)}>
        <AlertCircle className="h-3 w-3" />
        Index failed
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] text-muted-foreground", className)}>
      <Loader2 className="h-3 w-3 animate-spin" />
      Indexing...
    </span>
  );
}
