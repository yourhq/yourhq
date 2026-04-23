"use client";

import { useState } from "react";
import { ArrowRight, Laptop, Server, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepPlacementProps {
  ownerName: string;
  onSubmit: (placement: "local" | "remote") => void;
  pending: boolean;
}

export function StepPlacement({
  ownerName,
  onSubmit,
  pending,
}: StepPlacementProps) {
  const [choice, setChoice] = useState<"local" | "remote" | null>(null);

  const firstName = ownerName.split(" ")[0] || "there";

  return (
    <div className="space-y-10 pt-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Agents
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Where should your agents run, {firstName}?
        </h1>
        <p className="max-w-[46ch] text-[14px] leading-relaxed text-muted-foreground">
          Agents browse the web, run commands, and do real work on your
          behalf. They need a machine to live on.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PlacementTile
          icon={<Server className="h-4 w-4" />}
          label="On another machine"
          description="A spare laptop, Mac mini, Raspberry Pi, or cheap VPS. Keeps agents running 24/7 and isolated from your main computer."
          selected={choice === "remote"}
          recommended
          onClick={() => setChoice("remote")}
        />

        <PlacementTile
          icon={<Laptop className="h-4 w-4" />}
          label="On this machine"
          description="Simplest setup. Good for trying things out. Agents pause when this computer sleeps."
          selected={choice === "local"}
          onClick={() => setChoice("local")}
        />
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-background/40 px-3 py-2.5 text-[11px] text-muted-foreground">
        <span className="shrink-0 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium text-foreground">
          Soon
        </span>
        <span>
          Hosted gateway — we&apos;ll run it for you for ~$5/mo.
        </span>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          disabled={!choice || pending}
          onClick={() => choice && onSubmit(choice)}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
            !choice || pending
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {pending ? "Saving…" : "Continue"}
          {!pending && (
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </div>
    </div>
  );
}

function PlacementTile({
  icon,
  label,
  description,
  selected,
  recommended,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  recommended?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border p-5 text-left transition-all duration-150",
        selected
          ? "border-foreground/80 bg-foreground/[0.04]"
          : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg transition-all",
            selected
              ? "bg-foreground text-background"
              : "bg-muted/60 text-foreground",
          )}
        >
          {icon}
        </span>

        {recommended && (
          <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium text-foreground">
            <Sparkles className="h-2.5 w-2.5" />
            Recommended
          </span>
        )}
      </div>

      <div>
        <div className="text-[14px] font-semibold leading-tight">{label}</div>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      {selected && (
        <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-foreground" />
      )}
    </button>
  );
}
