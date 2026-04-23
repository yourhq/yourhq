"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const EMOJIS = ["👋", "✨", "🪐", "🌱", "🎯", "🛠️", "🚀", "🌊", "🧭", "🔮"];

export interface StepWelcomeProps {
  initialName: string;
  initialEmoji: string;
  onSubmit: (vals: { ownerName: string; preferredName?: string; emoji: string }) => void;
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
    inputRef.current?.focus();
  }, []);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ ownerName: name.trim(), preferredName: name.trim(), emoji });
  };

  return (
    <form onSubmit={handle} className="space-y-8 pt-8">
      <div className="space-y-1.5">
        <h1 className="text-[28px] font-semibold tracking-tight">
          Welcome to HQ.
        </h1>
        <p className="text-[14px] text-muted-foreground">
          Your self-hosted agent operations platform. First, a quick
          introduction.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[12px] font-medium text-muted-foreground">
            What should we call you?
          </label>
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name or nickname"
            className="h-11 border-0 border-b border-border/60 rounded-none px-0 text-[18px] font-medium focus-visible:ring-0 focus-visible:border-foreground shadow-none"
            autoComplete="off"
            maxLength={80}
          />
        </div>

        <div className="space-y-2">
          <label className="text-[12px] font-medium text-muted-foreground">
            Pick an avatar
          </label>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`flex h-9 w-9 items-center justify-center rounded-md text-[18px] transition-colors ${
                  emoji === e
                    ? "bg-accent ring-1 ring-foreground"
                    : "hover:bg-accent/60"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          disabled={!name.trim() || pending}
          className="px-6"
        >
          {pending ? "Saving…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
