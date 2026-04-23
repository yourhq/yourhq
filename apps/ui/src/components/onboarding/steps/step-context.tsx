"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTEXT_PRESETS } from "@/lib/setup/templates";

export interface StepContextProps {
  ownerName: string;
  initialKey: string | null;
  onSubmit: (presetKey: string) => void;
  pending: boolean;
}

export function StepContext({
  ownerName,
  initialKey,
  onSubmit,
  pending,
}: StepContextProps) {
  const [selected, setSelected] = useState<string | null>(initialKey);

  const firstName = ownerName.split(" ")[0] || "there";

  return (
    <div className="space-y-10 pt-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Context
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          What will you use HQ for, {firstName}?
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          We&apos;ll pre-configure your pipeline, fields, and streams. You can
          customize everything later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CONTEXT_PRESETS.map((preset) => (
          <PresetTile
            key={preset.key}
            emoji={preset.emoji}
            label={preset.label}
            description={preset.description}
            selected={selected === preset.key}
            onClick={() => setSelected(preset.key)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
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
          {pending ? "Saving…" : "Continue"}
          {!pending && (
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
        <span className="text-[11px] text-muted-foreground/60">
          You can change this anytime
        </span>
      </div>
    </div>
  );
}

function PresetTile({
  emoji,
  label,
  description,
  selected,
  onClick,
}: {
  emoji: string;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all duration-150",
        selected
          ? "border-foreground/80 bg-foreground/[0.04] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
          : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-[18px] transition-all",
            selected ? "bg-foreground/[0.08]" : "bg-muted/60",
          )}
        >
          {emoji}
        </span>
        <span className="text-[14px] font-semibold leading-tight">{label}</span>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {description}
      </p>

      {selected && (
        <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-foreground" />
      )}
    </button>
  );
}
