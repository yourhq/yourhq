"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ArrowRight, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
  provisionStatus: "idle" | "provisioning" | "ready" | "error";
  provisionError?: string | null;
  pending: boolean;
}

export function StepAgent({
  recommendation,
  onCreateAgent,
  provisionStatus,
  provisionError,
  pending,
}: StepAgentProps) {
  const [agentName, setAgentName] = useState(recommendation.name);
  const [agentEmoji, setAgentEmoji] = useState(recommendation.emoji);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const displayName = agentName.trim() || recommendation.name;

  useEffect(() => {
    if (!showEmojiPicker) return;
    function handleClick(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showEmojiPicker]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    const result = await onCreateAgent({
      name: agentName.trim() || recommendation.name,
      emoji: agentEmoji,
      templateBranch: recommendation.templateBranch,
    });
    setCreating(false);
    if (result) setCreated(true);
  }, [agentName, agentEmoji, recommendation, onCreateAgent]);

  const isProvisioning = created && provisionStatus === "provisioning";
  const isReady = created && (provisionStatus === "ready" || provisionStatus === "error");

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Your first agent
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          {isReady
            ? `${displayName} is ready`
            : isProvisioning
              ? `Setting up ${displayName}…`
              : "Meet your agent"}
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          {isReady
            ? "Your agent is provisioned and ready to work."
            : isProvisioning
              ? "This usually takes about 30 seconds."
              : `Based on what you need, we recommend starting with ${recommendation.name}. Feel free to change the name and avatar.`}
        </p>
      </div>

      {/* Agent card */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-6">
        <div className="flex flex-col items-center gap-5">
          {/* Emoji button — large, tappable, with visible affordance */}
          <div className="relative" ref={emojiPickerRef}>
            <button
              type="button"
              onClick={() => !created && setShowEmojiPicker((p) => !p)}
              disabled={created}
              aria-label="Change avatar"
              className={cn(
                "flex h-24 w-24 items-center justify-center rounded-2xl text-[56px] leading-none transition-all",
                !created
                  ? "border-2 border-dashed border-border/80 hover:border-foreground/40 hover:bg-accent/30 cursor-pointer"
                  : "border-2 border-transparent",
              )}
            >
              {agentEmoji}
            </button>

            {showEmojiPicker && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-10 animate-in fade-in zoom-in-95 duration-150 rounded-xl border border-border/60 bg-card p-3 shadow-lg">
                <div
                  role="radiogroup"
                  aria-label="Choose an avatar"
                  className="grid grid-cols-8 gap-1"
                >
                  {AVATAR_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      role="radio"
                      aria-checked={agentEmoji === emoji}
                      aria-label={EMOJI_LABELS[emoji] ?? emoji}
                      onClick={() => {
                        setAgentEmoji(emoji);
                        setShowEmojiPicker(false);
                      }}
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
            )}
          </div>

          {/* Name — always a visible input field, Linear/Notion style */}
          {!created ? (
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder={recommendation.name}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !creating) handleCreate();
              }}
              className="text-center text-[20px] font-semibold bg-transparent border-0 border-b-2 border-border/50 outline-none w-56 pb-1 transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/50"
            />
          ) : (
            <div className="text-[20px] font-semibold">{displayName}</div>
          )}

          {/* Role + description */}
          <div className="text-center space-y-1.5">
            <div className="text-[13px] font-medium text-muted-foreground">
              {recommendation.role}
            </div>
            <p className="max-w-[36ch] text-[12px] leading-relaxed text-muted-foreground/70">
              {recommendation.description}
            </p>
          </div>

          {/* Provision status */}
          {created && (
            <div className="flex items-center gap-2 text-[13px] animate-in fade-in duration-300">
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
          )}
        </div>
      </div>

      {/* CTA — only shown before creation; after that the wizard auto-advances */}
      {!created && (
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
      )}
    </div>
  );
}
