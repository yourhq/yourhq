"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Archive, ArrowRightLeft, Trash2, X } from "lucide-react";

interface BulkActionBarProps {
  count: number;
  stages: { stage_key: string; label: string }[];
  showArchived: boolean;
  onStatusChange: (status: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  count,
  stages,
  showArchived,
  onStatusChange,
  onArchive,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 shadow-sm">
      <span className="text-caption font-medium tabular-nums">
        {count} selected
      </span>

      <div className="mx-1 h-4 w-px bg-border" />

      {showArchived ? (
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      ) : (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                Change status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {stages.map((s) => (
                <DropdownMenuItem
                  key={s.stage_key}
                  onClick={() => onStatusChange(s.stage_key)}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="sm" onClick={onArchive}>
            <Archive className="mr-1.5 h-3.5 w-3.5" />
            Archive
          </Button>
        </>
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClear}
        className="ml-auto"
        aria-label="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
