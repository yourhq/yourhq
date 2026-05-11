"use client";

import { useState, useCallback } from "react";
import { ArrowRight, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type SubPhase = "meet" | "name" | "provisioning";

const AVATAR_EMOJIS = [
  "🦊", "🦉", "🐙", "🦫", "🐝", "🐬", "🦅", "🦚", "🐺", "🦋", "🐧", "🦎",
  "🐆", "🦝", "🐋", "🦈", "🐕", "🐈", "🦜", "🐒", "🦄", "🐢", "🐦‍⬛", "🕷️",
];

const EMOJI_LABELS: Record<string, string> = {
  "🦊": "Fox", "🦉": "Owl", "🐙": "Octopus", "🦫": "Beaver", "🐝": "Bee",
  "🐬": "Dolphin", "🦅": "Eagle", "🦚": "Peacock", "🐺": "Wolf", "🦋": "Butterfly",
  "🐧": "Penguin", "🦎": "Lizard", "🐆": "Leopard", "🦝": "Raccoon", "🐋": "Whale",
  "🦈": "Shark", "🐕": "Dog", "🐈": "Cat", "🦜": "Parrot", "🐒": "Monkey",
  "🦄": "Unicorn", "🐢": "Turtle", "🐦‍⬛": "Raven", "🕷️": "Spider",
};

export interface AgentRecommendation {
  templateBranch: string;
  name: string;
  emoji: string;
  description: string;
  role: string;
}

export interface StepAgentProps {
  recommendation: AgentRecommendation;
  onCreateAgent: (data: {
    name: string;
    emoji: string;
    templateBranch: string;
  }) => Promise<{ agentId: string; provisionCommandId?: string } | null>;
  onDone: () => void;
  provisionStatus: "idle" | "provisioning" | "ready" | "error";
  provisionError?: string | null;
  pending: boolean;
}

export function StepAgent({
  recommendation,
  onCreateAgent,
  onDone,
  provisionStatus,
  provisionError,
  pending,
}: StepAgentProps) {
  const [phase, setPhase] = useState<SubPhase>("meet");
  const [agentName, setAgentName] = useState(recommendation.name);
  const [agentEmoji, setAgentEmoji] = useState(recommendation.emoji);
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    const result = await onCreateAgent({
      name: agentName.trim() || recommendation.name,
      emoji: agentEmoji,
      templateBranch: recommendation.templateBranch,
    });
    setCreating(false);
    if (result) {
      setPhase("provisioning");
    }
  }, [agentName, agentEmoji, recommendation, onCreateAgent]);

  const displayName = agentName.trim() || recommendation.name;

  return (
    <div key={phase} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      {phase === "meet" && (
        <div className="space-y-8">
          <div className="space-y-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
              Your first agent
            </div>
            <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
              Meet your agent
            </h1>
            <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
              Based on what you need, we recommend starting with:
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/40 p-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="text-[72px] leading-none" style={{ animation: "gentle-breathe 4s ease-in-out infinite" }}>{recommendation.emoji}</span>
              <div>
                <div className="text-[18px] font-semibold">{recommendation.name}</div>
                <div className="mt-1 text-[13px] text-muted-foreground">
                  {recommendation.role}
                </div>
              </div>
              <p className="max-w-[36ch] text-[13px] leading-relaxed text-muted-foreground/80">
                {recommendation.description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPhase("name")}
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background transition-all hover:bg-foreground/90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2"
          >
            Set up {recommendation.name}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      )}

      {phase === "name" && (
        <div className="space-y-8">
          <div className="space-y-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
              Your first agent
            </div>
            <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
              What do you want to call them?
            </h1>
            <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
              Give your agent a name. You can change it anytime.
            </p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="agent-name"
                className="text-[13px] font-medium text-foreground"
              >
                Name
              </label>
              <input
                id="agent-name"
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder={recommendation.name}
                autoFocus
                className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !creating) handleCreate();
                }}
              />
            </div>

            <div className="space-y-2">
              <span className="text-[13px] font-medium text-foreground">
                Avatar
              </span>
              <div
                role="radiogroup"
                aria-label="Choose an avatar"
                className="flex flex-wrap gap-1.5"
              >
                {AVATAR_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    role="radio"
                    aria-checked={agentEmoji === emoji}
                    aria-label={EMOJI_LABELS[emoji] ?? emoji}
                    onClick={() => setAgentEmoji(emoji)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg text-[18px] transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                      agentEmoji === emoji
                        ? "bg-foreground/[0.1] ring-1 ring-foreground/40 scale-110"
                        : "hover:bg-accent/40",
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || pending}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
              creating || pending
                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
            )}
          >
            {creating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creating {displayName}…
              </>
            ) : (
              <>
                Create {displayName}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </div>
      )}

      {phase === "provisioning" && (
        <div className="space-y-8">
          <div className="space-y-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
              Setting up
            </div>
            <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
              {provisionStatus === "ready"
                ? `${displayName} is ready`
                : `Setting up ${displayName}…`}
            </h1>
            <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
              {provisionStatus === "ready"
                ? "Your agent is provisioned and ready to work."
                : "This usually takes about 30 seconds."}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/40 p-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="text-[72px] leading-none">{agentEmoji}</span>
              <div className="text-[18px] font-semibold">{displayName}</div>

              <div className="flex items-center gap-2 text-[13px]">
                {provisionStatus === "provisioning" && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">Provisioning…</span>
                  </>
                )}
                {provisionStatus === "ready" && (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-green-600">Ready</span>
                  </>
                )}
                {provisionStatus === "error" && (
                  <span className="text-destructive text-[12px]">
                    {provisionError || "Setup failed — you can retry from the agent page."}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onDone}
            disabled={provisionStatus === "provisioning"}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
              provisionStatus === "provisioning"
                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
            )}
          >
            Continue
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      )}
    </div>
  );
}

