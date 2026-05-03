"use client";

import type { KnowledgeScope } from "@/lib/knowledge/types";
import { Globe2, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface KnowledgeScopeBadgeProps {
  scope: KnowledgeScope;
  className?: string;
}

export function KnowledgeScopeBadge({ scope, className }: KnowledgeScopeBadgeProps) {
  if (scope === "workspace") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[10px] text-muted-foreground", className)}>
        <Globe2 className="h-3 w-3" />
        Workspace
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] text-sky-400", className)}>
      <Bot className="h-3 w-3" />
      Agent
    </span>
  );
}
