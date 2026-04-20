"use client";

import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ArchiveToggleProps {
  showArchived: boolean;
  onToggle: (value: boolean) => void;
  count?: number;
}

export function ArchiveToggle({ showArchived, onToggle, count }: ArchiveToggleProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-6 gap-1 px-2 text-xs font-normal",
        showArchived && "bg-accent text-accent-foreground"
      )}
      onClick={() => onToggle(!showArchived)}
    >
      <Archive className="h-3 w-3" />
      <span className="hidden sm:inline">Archived</span>
      {showArchived && count !== undefined && count > 0 && (
        <span className="ml-0.5 tabular-nums text-muted-foreground">{count}</span>
      )}
    </Button>
  );
}
