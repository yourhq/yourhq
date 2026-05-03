"use client";

import { cn } from "@/lib/utils";
import { CONTEXT_PRESETS, type ContextPreset } from "@/lib/setup/templates";

export interface IntentCardsProps {
  selected: string | null;
  onSelect: (key: string) => void;
}

const INTENT_ICONS: Record<string, string> = {
  reach: "🔍",
  deals: "💰",
  hire: "👥",
  publish: "✍️",
  run: "⚡",
  explore: "🛠️",
};

export function IntentCards({ selected, onSelect }: IntentCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {CONTEXT_PRESETS.map((preset) => (
        <IntentCard
          key={preset.key}
          preset={preset}
          icon={INTENT_ICONS[preset.key] ?? preset.emoji}
          selected={selected === preset.key}
          onClick={() => onSelect(preset.key)}
        />
      ))}
    </div>
  );
}

function IntentCard({
  preset,
  icon,
  selected,
  onClick,
}: {
  preset: ContextPreset;
  icon: string;
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
          {icon}
        </span>
        <span className="text-[14px] font-semibold leading-tight">
          {preset.label}
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {preset.description}
      </p>

      {selected && (
        <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-foreground" />
      )}
    </button>
  );
}
