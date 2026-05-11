"use client";

import { Lock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SECRET_SYNC_META,
  SECRET_CATEGORY_LABELS,
  type Secret,
} from "@/lib/secrets/types";
import { cn } from "@/lib/utils";

interface SecretRowProps {
  secret: Secret;
  isFirst: boolean;
  onEdit: () => void;
  onRemove: () => void;
  scopeLabel?: string;
}

export function SecretRow({
  secret,
  isFirst,
  onEdit,
  onRemove,
  scopeLabel,
}: SecretRowProps) {
  const syncMeta = SECRET_SYNC_META[secret.sync_status];
  const categoryLabel = SECRET_CATEGORY_LABELS[secret.category];

  return (
    <div
      className={cn(
        "group relative flex h-14 items-center gap-3 px-3 transition-colors hover:bg-muted/20",
        !isFirst && "border-t border-border/50",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40 text-muted-foreground">
        <Lock className="h-4 w-4" />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="max-w-[200px] truncate text-[13px] font-medium text-foreground">
          {secret.name}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: syncMeta.color }}
          />
          {syncMeta.label}
        </span>
      </div>

      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
        {secret.key}
      </span>

      <span className="shrink-0 text-[11px] text-muted-foreground/70 transition-opacity group-hover:opacity-0">
        {scopeLabel ?? categoryLabel}
        {secret.note && ` · "${secret.note}"`}
      </span>

      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Secret actions">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onEdit();
              }}
              className="gap-2"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onRemove();
              }}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
