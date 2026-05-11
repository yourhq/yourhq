"use client";

import { useState, useCallback } from "react";
import {
  ArrowRight,
  Check,
  Clipboard,
  ExternalLink,
  Loader2,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import type { Agent, AgentMeta } from "@/lib/agents/types";
import { connectAgentChannel, submitAgentPairing, pollProvisionStatus } from "@/app/dashboard/agents/actions";
import { completeItem } from "@/lib/onboarding/progress";

type ChannelId = "telegram" | "discord" | "slack";
type Phase = "select" | "credentials" | "provisioning" | "pairing" | "connected";

const CHANNEL_OPTIONS: { id: ChannelId; label: string; icon: string; tag?: string }[] = [
  { id: "telegram", label: "Telegram", icon: "✈️", tag: "Recommended" },
  { id: "discord", label: "Discord", icon: "🎮" },
  { id: "slack", label: "Slack", icon: "💬" },
];

interface AgentChannelCardProps {
  agent: Agent;
  onAgentUpdated?: () => void;
}

export function AgentChannelCard({ agent, onAgentUpdated }: AgentChannelCardProps) {
  const meta = (agent.meta ?? {}) as AgentMeta;
  const existingChannel = meta.channel && meta.channel !== "none" ? meta.channel : null;

  const [phase, setPhase] = useState<Phase>(existingChannel ? "connected" : "select");
  const [channelType, setChannelType] = useState<ChannelId | null>(existingChannel ?? null);

  // Credentials
  const [botToken, setBotToken] = useState("");
  const [discordServerId, setDiscordServerId] = useState("");
  const [discordUserId, setDiscordUserId] = useState("");
  const [slackAppToken, setSlackAppToken] = useState("");
  const [slackBotToken, setSlackBotToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Provisioning + pairing
  const [provisionDone, setProvisionDone] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingResult, setPairingResult] = useState<"idle" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reconnect flow
  const [showReconnect, setShowReconnect] = useState(false);

  const tokenValid = (() => {
    if (!channelType) return false;
    if (channelType === "telegram") return botToken.trim().length > 20;
    if (channelType === "discord") return botToken.trim().length > 20;
    if (channelType === "slack") return slackAppToken.trim().length > 10 && slackBotToken.trim().length > 10;
    return false;
  })();

  const handleSelectChannel = useCallback((id: ChannelId) => {
    setChannelType(id);
    setBotToken("");
    setSlackAppToken("");
    setSlackBotToken("");
    setDiscordServerId("");
    setDiscordUserId("");
    setErrorMsg(null);
    setPhase("credentials");
  }, []);

  const handleConnect = useCallback(async () => {
    if (!channelType) return;
    setConnecting(true);
    setErrorMsg(null);

    const extras: Record<string, string> = {};
    if (channelType === "discord") {
      if (discordServerId.trim()) extras.discord_server_id = discordServerId.trim();
      if (discordUserId.trim()) extras.discord_user_id = discordUserId.trim();
    }
    if (channelType === "slack" && slackBotToken.trim()) {
      extras.slack_bot_token = slackBotToken.trim();
    }

    const r = await connectAgentChannel({
      agentId: agent.id,
      agentSlug: agent.slug,
      channel: channelType,
      token: channelType === "slack" ? slackAppToken.trim() : botToken.trim(),
      extras,
    });

    setConnecting(false);

    if (!r.ok) {
      setErrorMsg(r.error ?? "Failed to connect channel");
      return;
    }

    completeItem("channelConnected");

    if (channelType === "slack") {
      toast.success("Slack connected");
      setPhase("connected");
      onAgentUpdated?.();
      return;
    }

    setPhase("provisioning");

    // Poll provision status
    if (r.provisionCommandId) {
      const startedAt = Date.now();
      const interval = setInterval(async () => {
        const status = await pollProvisionStatus(r.provisionCommandId!);
        if (status === "completed") {
          clearInterval(interval);
          setProvisionDone(true);
          setPhase("pairing");
        } else if (status === "error") {
          clearInterval(interval);
          setProvisionDone(true);
          setPhase("pairing");
        } else if (Date.now() - startedAt > 120_000) {
          clearInterval(interval);
          setProvisionDone(true);
          setPhase("pairing");
        }
      }, 3000);
    } else {
      setProvisionDone(true);
      setPhase("pairing");
    }
  }, [agent.id, agent.slug, channelType, botToken, discordServerId, discordUserId, slackAppToken, slackBotToken, onAgentUpdated]);

  const handleSubmitPairing = useCallback(async () => {
    if (!channelType || !pairingCode.trim()) return;
    setPairingBusy(true);
    setErrorMsg(null);
    const r = await submitAgentPairing({
      agentId: agent.id,
      agentSlug: agent.slug,
      channel: channelType,
      pairingCode: pairingCode.trim(),
    });
    setPairingBusy(false);
    if (r.ok) {
      setPairingResult("done");
      toast.success("Paired successfully");
      setTimeout(() => {
        setPhase("connected");
        onAgentUpdated?.();
      }, 1200);
    } else {
      setPairingResult("error");
      setErrorMsg(r.error ?? "Pairing failed");
    }
  }, [agent.id, agent.slug, channelType, pairingCode, onAgentUpdated]);

  const handleSkipPairing = useCallback(() => {
    setPhase("connected");
    onAgentUpdated?.();
  }, [onAgentUpdated]);

  // ── Connected state ──────────────────────────────────────────
  if (phase === "connected" && existingChannel && !showReconnect) {
    const ch = CHANNEL_OPTIONS.find((c) => c.id === existingChannel);
    return (
      <div className="rounded-lg border border-border/50 bg-accent/20 px-4 py-3 flex items-center gap-3">
        <span className="text-base">{ch?.icon ?? "💬"}</span>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-medium">
            Connected via {ch?.label ?? existingChannel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowReconnect(true);
            setPhase("select");
            setChannelType(null);
          }}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Change
        </button>
      </div>
    );
  }

  // ── No channel / setup flow ──────────────────────────────────
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] font-semibold">Messaging channel</span>
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Connect a channel to chat with {agent.name} on Telegram, Discord, or Slack.
        </p>
      </div>

      <div className="p-4">
        {errorMsg && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Phase: select */}
        {phase === "select" && (
          <div className="space-y-2">
            {CHANNEL_OPTIONS.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleSelectChannel(ch.id)}
                className="w-full flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5 text-left transition-all hover:border-foreground/30 hover:bg-accent/30"
              >
                <span className="text-base">{ch.icon}</span>
                <span className="text-[13px] font-medium flex-1">{ch.label}</span>
                {ch.tag && (
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {ch.tag}
                  </span>
                )}
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {/* Phase: credentials */}
        {phase === "credentials" && channelType && (
          <div className="animate-in fade-in duration-200 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
              <div className="space-y-3">
                {channelType === "telegram" && (
                  <TokenField
                    label="Bot token"
                    value={botToken}
                    onChange={setBotToken}
                    placeholder="123456789:ABCdefGHI…"
                  />
                )}
                {channelType === "discord" && (
                  <>
                    <TokenField
                      label="Bot token"
                      value={botToken}
                      onChange={setBotToken}
                      placeholder="Bot token from Developer Portal"
                    />
                    <PlainField
                      label="Server ID"
                      hint="optional"
                      value={discordServerId}
                      onChange={setDiscordServerId}
                      placeholder="Right-click server → Copy Server ID"
                    />
                    <PlainField
                      label="Your User ID"
                      hint="optional"
                      value={discordUserId}
                      onChange={setDiscordUserId}
                      placeholder="Right-click avatar → Copy User ID"
                    />
                  </>
                )}
                {channelType === "slack" && (
                  <>
                    <TokenField
                      label="App-Level Token"
                      value={slackAppToken}
                      onChange={setSlackAppToken}
                      placeholder="xapp-1-…"
                    />
                    <TokenField
                      label="Bot Token"
                      value={slackBotToken}
                      onChange={setSlackBotToken}
                      placeholder="xoxb-…"
                    />
                  </>
                )}
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
                  How to get it
                </p>
                {channelType === "telegram" && (
                  <InstructionSteps items={[
                    <>Message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-foreground underline decoration-border hover:decoration-foreground">@BotFather</a></>,
                    <>Send <span className="font-mono text-foreground">/newbot</span></>,
                    "Follow the prompts",
                    "Copy the token and paste it here",
                  ]} />
                )}
                {channelType === "discord" && (
                  <InstructionSteps items={[
                    <><a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-foreground underline decoration-border hover:decoration-foreground">Developer Portal</a> → New App</>,
                    "Bot → Reset Token",
                    "Enable Message Content Intent",
                    "OAuth2 → invite to server",
                  ]} />
                )}
                {channelType === "slack" && (
                  <InstructionSteps items={[
                    <><a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="text-foreground underline decoration-border hover:decoration-foreground">api.slack.com/apps</a> → Create New App</>,
                    "Socket Mode → App-Level Token",
                    "OAuth & Permissions → install",
                    "Copy the Bot User OAuth Token",
                  ]} />
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleConnect}
                disabled={!tokenValid || connecting}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium transition-all",
                  !tokenValid || connecting
                    ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                    : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
                )}
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    Connect
                    <ArrowRight className="h-3 w-3" />
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase("select");
                  setChannelType(null);
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Phase: provisioning */}
        {phase === "provisioning" && (
          <div className="animate-in fade-in duration-200 flex items-center gap-3 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-[13px] text-muted-foreground">
              Setting up {channelType === "telegram" ? "Telegram" : "Discord"} bot…
            </span>
          </div>
        )}

        {/* Phase: pairing */}
        {phase === "pairing" && channelType && (
          <div className="animate-in fade-in duration-200 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium">
                    Pairing code
                  </label>
                  <div className="mt-2">
                    <InputOTP
                      maxLength={6}
                      value={pairingCode}
                      onChange={setPairingCode}
                      onComplete={handleSubmitPairing}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} className="h-10 w-9 text-base" />
                        <InputOTPSlot index={1} className="h-10 w-9 text-base" />
                        <InputOTPSlot index={2} className="h-10 w-9 text-base" />
                        <InputOTPSlot index={3} className="h-10 w-9 text-base" />
                        <InputOTPSlot index={4} className="h-10 w-9 text-base" />
                        <InputOTPSlot index={5} className="h-10 w-9 text-base" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground/50">
                    {pairingCode.trim()
                      ? "Press Enter to pair"
                      : channelType === "telegram"
                        ? "Send /start to your bot, then enter the code"
                        : "DM your bot, then enter the code"}
                  </p>
                </div>

                {pairingBusy && (
                  <div className="flex items-center gap-2 text-[11px] text-blue-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Pairing…
                  </div>
                )}
                {pairingResult === "done" && (
                  <div className="flex items-center gap-2 text-[11px] text-green-400">
                    <Check className="h-3 w-3" />
                    Paired!
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSubmitPairing}
                    disabled={!pairingCode.trim() || pairingBusy}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-medium transition-all",
                      !pairingCode.trim() || pairingBusy
                        ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                        : "bg-foreground text-background hover:bg-foreground/90",
                    )}
                  >
                    {pairingBusy ? "Pairing…" : "Submit code"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipPairing}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Skip — I&apos;ll pair later
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
                <p className="mb-2 text-[11px] font-medium text-foreground">
                  Get your pairing code
                </p>
                {channelType === "telegram" && (
                  <>
                    <InstructionSteps items={[
                      "Find your bot in Telegram",
                      <>Send <span className="font-mono text-foreground">/start</span></>,
                      "Copy the code it replies with",
                      "Paste it here",
                    ]} />
                    <a
                      href="https://t.me/"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-foreground underline decoration-border hover:decoration-foreground"
                    >
                      Open Telegram
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )}
                {channelType === "discord" && (
                  <InstructionSteps items={[
                    "DM the bot you invited",
                    "Copy the pairing code it replies with",
                    "Paste it here",
                  ]} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Phase: just connected (no prior channel) */}
        {phase === "connected" && !existingChannel && (
          <div className="flex items-center gap-2 text-[13px] text-green-600">
            <Check className="h-4 w-4" />
            Channel connected
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────

function TokenField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text.trim());
    } catch { /* clipboard unavailable */ }
  }
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-9 rounded-lg border border-border/50 bg-transparent pl-3 pr-16 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-border/80 placeholder:text-muted-foreground/30"
        />
        <button
          type="button"
          onClick={handlePaste}
          className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <Clipboard className="h-2.5 w-2.5" />
          Paste
        </button>
      </div>
    </div>
  );
}

function PlainField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1.5">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium">{label}</label>
        {hint && <span className="text-[10px] text-muted-foreground/35 normal-case">{hint}</span>}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 rounded-lg border border-border/50 bg-transparent px-3 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-border/80 placeholder:text-muted-foreground/30"
      />
    </div>
  );
}

function InstructionSteps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/40 text-[9px] font-medium text-muted-foreground/60">
            {i + 1}
          </span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ol>
  );
}
