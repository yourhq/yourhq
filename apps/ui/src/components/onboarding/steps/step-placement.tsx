"use client";

import { useState } from "react";
import { Laptop, Server, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StepPlacementProps {
  ownerName: string;
  onSubmit: (placement: "local" | "remote") => void;
  pending: boolean;
}

export function StepPlacement({ ownerName, onSubmit, pending }: StepPlacementProps) {
  const [choice, setChoice] = useState<"local" | "remote" | null>(null);

  const firstName = ownerName.split(" ")[0] || "there";

  return (
    <div className="space-y-8 pt-6">
      <div className="space-y-1.5">
        <h1 className="text-[24px] font-semibold tracking-tight">
          Where should your agents run, {firstName}?
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Agents browse the web, run commands, and do real work on your
          behalf. They need a machine to live on.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setChoice("remote")}
          className={cn(
            "group relative flex flex-col gap-3 rounded-lg border p-5 text-left transition-colors",
            choice === "remote"
              ? "border-foreground bg-accent/40"
              : "border-border/60 bg-card hover:border-border hover:bg-card/80",
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md",
                choice === "remote" ? "bg-foreground text-background" : "bg-muted text-foreground",
              )}
            >
              <Server className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1.5 rounded bg-foreground/90 px-1.5 py-0.5 text-[10px] font-medium text-background">
              <Sparkles className="h-2.5 w-2.5" />
              Recommended
            </div>
          </div>

          <div>
            <div className="text-[14px] font-semibold">On another machine</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              A spare laptop, Mac mini, Raspberry Pi, or cheap VPS. Keeps
              agents running 24/7 and isolated from your main computer.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setChoice("local")}
          className={cn(
            "group relative flex flex-col gap-3 rounded-lg border p-5 text-left transition-colors",
            choice === "local"
              ? "border-foreground bg-accent/40"
              : "border-border/60 bg-card hover:border-border hover:bg-card/80",
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md",
                choice === "local" ? "bg-foreground text-background" : "bg-muted text-foreground",
              )}
            >
              <Laptop className="h-4 w-4" />
            </div>
          </div>

          <div>
            <div className="text-[14px] font-semibold">On this machine</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Simplest setup. Good for trying things out. Agents pause
              when this computer sleeps.
            </p>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span>Soon:</span>
        <span className="font-medium">
          Hosted gateway — we&apos;ll run it for you for ~$5/mo.
        </span>
      </div>

      <div className="pt-2">
        <Button disabled={!choice || pending} onClick={() => choice && onSubmit(choice)}>
          {pending ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
