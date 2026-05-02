"use client";

import type { KnowledgeKind } from "@/lib/knowledge/types";
import { KNOWLEDGE_KIND_COLORS } from "@/lib/knowledge/types";
import { FileText, BookOpen, File, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND_ICONS: Record<KnowledgeKind, React.ElementType> = {
  page: FileText,
  playbook: BookOpen,
  file: File,
  source: Globe,
};

interface KnowledgeKindBadgeProps {
  kind: KnowledgeKind;
  className?: string;
}

export function KnowledgeKindBadge({ kind, className }: KnowledgeKindBadgeProps) {
  const Icon = KIND_ICONS[kind];
  const colors = KNOWLEDGE_KIND_COLORS[kind];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
        colors,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {kind}
    </span>
  );
}
