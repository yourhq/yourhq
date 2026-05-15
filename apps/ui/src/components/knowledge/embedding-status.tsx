"use client";

import { CheckCircle2, AlertCircle, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("inline-flex items-center gap-1 text-[10px] text-status-success", className)}>
              <Search className="h-3 w-3" />
              Search ready
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[11px]">
            This document is indexed and searchable by your agents
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (chunkStatus === "indexed") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("inline-flex items-center gap-1 text-[10px] text-status-warning", className)}>
              <CheckCircle2 className="h-3 w-3" />
              Text ready
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[11px]">
            Text is indexed; search embedding is still processing
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (embeddingStatus === "failed" || chunkStatus === "failed") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("inline-flex items-center gap-1 text-[10px] text-status-error", className)}>
              <AlertCircle className="h-3 w-3" />
              Index failed
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[11px]">
            Indexing failed — click retry to re-process
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex items-center gap-1 text-[10px] text-muted-foreground", className)}>
            <Loader2 className="h-3 w-3 animate-spin" />
            Indexing...
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[11px]">
          Your document is being indexed so agents can search it
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
