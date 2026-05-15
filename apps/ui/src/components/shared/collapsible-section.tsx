"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  icon: React.ElementType;
  label: string;
  count?: number;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  icon: Icon,
  label,
  count,
  defaultOpen = true,
  action,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <div className="flex items-center gap-1">
        <CollapsibleTrigger className="flex items-center gap-1.5 py-1 -ml-1 px-1 rounded hover:bg-accent/40 transition-colors min-h-[28px]">
          <ChevronRight
            className={cn(
              "h-3 w-3 text-muted-foreground/60 transition-transform duration-150",
              open && "rotate-90"
            )}
          />
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
          {count !== undefined && count > 0 && (
            <span className="text-[10px] text-muted-foreground/50 tabular-nums">
              {count}
            </span>
          )}
        </CollapsibleTrigger>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
