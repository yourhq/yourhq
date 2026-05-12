"use client";

import { useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConceptExplainerProps {
  trigger: string;
  children: React.ReactNode;
}

export function ConceptExplainer({ trigger, children }: ConceptExplainerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[12px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
      >
        <Info className="h-3 w-3" />
        <span>{trigger}</span>
        <ChevronRight
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            open && "rotate-90",
          )}
        />
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border/40 bg-muted/20 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
