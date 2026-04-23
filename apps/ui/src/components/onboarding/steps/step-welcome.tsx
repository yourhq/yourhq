"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const EMOJIS = ["👋", "✨", "🪐", "🌱", "🎯", "🛠️", "🚀", "🌊", "🧭", "🔮"];

export interface StepWelcomeProps {
  initialName: string;
  initialEmoji: string;
  onSubmit: (vals: {
    ownerName: string;
    preferredName?: string;
    emoji: string;
  }) => void;
  pending: boolean;
}

export function StepWelcome({
  initialName,
  initialEmoji,
  onSubmit,
  pending,
}: StepWelcomeProps) {
  const [name, setName] = useState(initialName);
  const [emoji, setEmoji] = useState(initialEmoji);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ ownerName: name.trim(), preferredName: name.trim(), emoji });
  };

  return (
    <form onSubmit={handle} className="space-y-12 pt-12">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Welcome
        </div>
        <h1 className="text-[34px] font-semibold leading-[1.1] tracking-tight">
          Let&apos;s set up your HQ.
        </h1>
        <p className="max-w-[32ch] text-[15px] leading-relaxed text-muted-foreground">
          Your self-hosted agent operations platform. Takes about three
          minutes.
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-3">
          <label className="text-[12px] font-medium text-muted-foreground">
            What should we call you?
          </label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name or nickname"
            maxLength={80}
            autoComplete="off"
            className="w-full border-0 border-b border-border/60 bg-transparent pb-2 text-[24px] font-medium tracking-tight outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground"
          />
        </div>

        <div className="space-y-3">
          <label className="text-[12px] font-medium text-muted-foreground">
            Pick an avatar
          </label>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg text-[20px] transition-all duration-150",
                  emoji === e
                    ? "bg-foreground/[0.08] ring-1 ring-foreground/40 scale-105"
                    : "hover:bg-accent/60 hover:scale-105",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!name.trim() || pending}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
            !name.trim() || pending
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
          or press <kbd className="rounded border border-border/60 bg-muted/40 px-1 py-px font-mono text-[10px]">Enter</kbd>
        </span>
      </div>
    </form>
  );
}
