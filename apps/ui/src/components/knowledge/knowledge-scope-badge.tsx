"use client";

import type { KnowledgeScope } from "@/lib/knowledge/types";
import { Globe2, Bot, Library } from "lucide-react";
import { cn } from "@/lib/utils";

interface KnowledgeScopeBadgeProps {
  scope: KnowledgeScope;
  className?: string;
}

const SCOPE_CONFIG: Record<KnowledgeScope, { icon: typeof Globe2; label: string; color: string }> = {
  workspace: { icon: Globe2, label: "Workspace", color: "text-muted-foreground" },
  agent: { icon: Bot, label: "Agent", color: "text-accent-sky" },
  library: { icon: Library, label: "Library", color: "text-accent-amber" },
};

export function KnowledgeScopeBadge({ scope, className }: KnowledgeScopeBadgeProps) {
  const config = SCOPE_CONFIG[scope] ?? SCOPE_CONFIG.library;
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px]", config.color, className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
