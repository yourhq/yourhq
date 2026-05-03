"use client";

import { useState, useCallback } from "react";
import { ArrowRight, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type SubPhase = "meet" | "name" | "creating" | "channel" | "pairing" | "done";

const AVATAR_EMOJIS = [
  "🦊", "🦉", "🐙", "🦫", "🐝", "🐬", "🦅", "🦚", "🐺", "🦋", "🐧", "🦎",
  "🐆", "🦝", "🐋", "🦈", "🐕", "🐈", "🦜", "🐒", "🦄", "🐢", "🐦‍⬛", "🕷️",
];

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
  onSubmitChannel: (data: {
    agentId: string;
    channelType: string;
    token: string;
  }) => void;
  onSkipChannel: () => void;
  provisionStatus: "idle" | "provisioning" | "ready" | "error";
  provisionError?: string | null;
  pending: boolean;
}

export function StepAgent({
  recommendation,
  onCreateAgent,
  onSubmitChannel,
  onSkipChannel,
  provisionStatus,
  provisionError,
  pending,
}: StepAgentProps) {
  const [phase, setPhase] = useState<SubPhase>("meet");
  const [agentName, setAgentName] = useState(recommendation.name);
  const [agentEmoji, setAgentEmoji] = useState(recommendation.emoji);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [channelType, setChannelType] = useState<string | null>(null);
  const [channelToken, setChannelToken] = useState("");
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
      setAgentId(result.agentId);
      setPhase("channel");
    }
  }, [agentName, agentEmoji, recommendation, onCreateAgent]);

  if (phase === "meet") {
    return (
      <div className="space-y-10 pt-8">
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
            <span className="text-[48px]">{recommendation.emoji}</span>
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
          className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background transition-all hover:bg-foreground/90"
        >
          Let&apos;s get started
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    );
  }

  if (phase === "name") {
    return (
      <div className="space-y-10 pt-8">
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
            <div className="flex flex-wrap gap-1.5">
              {AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAgentEmoji(emoji)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg text-[18px] transition-all",
                    agentEmoji === emoji
                      ? "bg-foreground/[0.1] ring-1 ring-foreground/40"
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
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
            creating || pending
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {creating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Creating {agentName || recommendation.name}…
            </>
          ) : (
            <>
              Create {agentName || recommendation.name}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    );
  }

  if (phase === "channel") {
    const displayName = agentName || recommendation.name;
    const provisionReady = provisionStatus === "ready";

    return (
      <div className="space-y-10 pt-8">
        <div className="space-y-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            Messaging
          </div>
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
            How should {displayName} reach you?
          </h1>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
            Connect a messaging channel so your agent can send you updates
            and ask questions in real time.
          </p>
        </div>

        {/* Provision status indicator */}
        <div className="flex items-center gap-2 text-[12px]">
          {provisionStatus === "provisioning" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">
                {displayName} is getting set up…
              </span>
            </>
          )}
          {provisionStatus === "ready" && (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-green-600">{displayName} is ready</span>
            </>
          )}
          {provisionStatus === "error" && (
            <span className="text-destructive">
              Setup error: {provisionError}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {[
            { id: "telegram", label: "Telegram", badge: "Recommended" },
            { id: "discord", label: "Discord", badge: null },
            { id: "slack", label: "Slack", badge: null },
          ].map((ch) => (
            <div key={ch.id}>
              <button
                type="button"
                onClick={() => setChannelType(ch.id === channelType ? null : ch.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-150",
                  channelType === ch.id
                    ? "border-foreground/80 bg-foreground/[0.04]"
                    : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                )}
              >
                <span className="text-[14px] font-medium">{ch.label}</span>
                {ch.badge && (
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {ch.badge}
                  </span>
                )}
                {channelType === ch.id && (
                  <div className="ml-auto h-2 w-2 rounded-full bg-foreground" />
                )}
              </button>

              {channelType === ch.id && (
                <div className="px-4 pb-3 pt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                  {ch.id === "telegram" && (
                    <div className="space-y-2">
                      <p className="text-[12px] text-muted-foreground">
                        1. Open Telegram → search for{" "}
                        <span className="font-medium">@BotFather</span>
                        <br />
                        2. Send <code className="rounded bg-muted px-1 py-0.5 text-[11px]">/newbot</code> and follow the prompts
                        <br />
                        3. Paste the API token below
                      </p>
                      <input
                        type="text"
                        value={channelToken}
                        onChange={(e) => setChannelToken(e.target.value)}
                        placeholder="123456789:ABCdefGHI..."
                        className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                      />
                    </div>
                  )}
                  {ch.id === "discord" && (
                    <div className="space-y-2">
                      <p className="text-[12px] text-muted-foreground">
                        1. Go to{" "}
                        <span className="font-medium">
                          discord.com/developers
                        </span>{" "}
                        → New Application
                        <br />
                        2. Under Bot, click Reset Token and copy it
                        <br />
                        3. Paste it below
                      </p>
                      <input
                        type="text"
                        value={channelToken}
                        onChange={(e) => setChannelToken(e.target.value)}
                        placeholder="Bot token..."
                        className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                      />
                    </div>
                  )}
                  {ch.id === "slack" && (
                    <div className="space-y-2">
                      <p className="text-[12px] text-muted-foreground">
                        1. Create a Slack App at{" "}
                        <span className="font-medium">api.slack.com/apps</span>
                        <br />
                        2. Under OAuth & Permissions, install to your workspace
                        <br />
                        3. Copy the Bot User OAuth Token below
                      </p>
                      <input
                        type="text"
                        value={channelToken}
                        onChange={(e) => setChannelToken(e.target.value)}
                        placeholder="xoxb-..."
                        className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          {channelType && channelToken.trim() ? (
            <button
              type="button"
              onClick={() => {
                if (agentId && channelType) {
                  onSubmitChannel({
                    agentId,
                    channelType,
                    token: channelToken.trim(),
                  });
                }
              }}
              disabled={!provisionReady || pending}
              className={cn(
                "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
                !provisionReady || pending
                  ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                  : "bg-foreground text-background hover:bg-foreground/90",
              )}
            >
              {!provisionReady ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Waiting for {displayName}…
                </>
              ) : pending ? (
                "Connecting…"
              ) : (
                <>
                  Connect & finish
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onSkipChannel}
              className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background transition-all hover:bg-foreground/90"
            >
              Skip for now
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground/60">
          {displayName} also works through Tasks — you can always connect a
          channel later in Settings.
        </p>
      </div>
    );
  }

  return null;
}
