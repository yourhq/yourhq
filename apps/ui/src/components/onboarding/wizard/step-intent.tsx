"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntentCards } from "./intent-cards";

export interface StepIntentProps {
  ownerName: string;
  initialKey?: string | null;
  onSubmit: (intentKey: string) => void;
  pending: boolean;
}

export function StepIntent({
  ownerName,
  initialKey,
  onSubmit,
  pending,
}: StepIntentProps) {
  const [selected, setSelected] = useState<string | null>(initialKey ?? null);

  const firstName = ownerName.split(" ")[0] || "there";

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Your work
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          What do you need help with, {firstName}?
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          Pick what matters most. We&apos;ll configure your workspace and
          recommend the right agent to start.
        </p>
      </div>

      <IntentCards selected={selected} onSelect={setSelected} />

      <p className="text-[12px] text-muted-foreground">
        You can change this anytime.
      </p>

      <div className="pt-2">
        <button
          type="button"
          onClick={() => selected && onSubmit(selected)}
          disabled={!selected || pending}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
            !selected || pending
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {pending ? "Setting up…" : "Continue"}
          {!pending && (
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </div>
    </div>
  );
}
