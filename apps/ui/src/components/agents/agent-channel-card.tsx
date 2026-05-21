"use client";

import type { SVGProps } from "react";
import { useState, useCallback } from "react";
import {
  ArrowRight,
  Check,
  Clipboard,
  ExternalLink,
  Loader2,
  AlertCircle,
  MessageSquare,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import type { Agent, AgentMeta } from "@/lib/agents/types";
import { connectAgentChannel, submitAgentPairing, pollProvisionStatus } from "@/app/dashboard/agents/actions";
import { completeItem } from "@/lib/onboarding/progress";

type ChannelId = "telegram" | "discord" | "slack";
type Phase = "select" | "credentials" | "provisioning" | "pairing" | "connected";

function TelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function DiscordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
    </svg>
  );
}

function SlackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}

const CHANNEL_ICONS: Record<ChannelId, typeof TelegramIcon> = {
  telegram: TelegramIcon,
  discord: DiscordIcon,
  slack: SlackIcon,
};

const CHANNEL_COLORS: Record<ChannelId, string> = {
  telegram: "text-[#26A5E4]",
  discord: "text-[#5865F2]",
  slack: "text-[#E01E5A]",
};

const CHANNEL_OPTIONS: { id: ChannelId; label: string; tag?: string }[] = [
  { id: "telegram", label: "Telegram", tag: "Recommended" },
  { id: "discord", label: "Discord" },
  { id: "slack", label: "Slack" },
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
  const [, setProvisionDone] = useState(false);
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

    setPhase("provisioning");

    if (r.provisionCommandId) {
      const startedAt = Date.now();
      const pollInterval = setInterval(async () => {
        const status = await pollProvisionStatus(r.provisionCommandId!);
        if (status === "completed" || status === "error" || Date.now() - startedAt > 120_000) {
          clearInterval(pollInterval);
          setProvisionDone(true);
          if (channelType === "slack") {
            toast.success("Slack connected");
            setPhase("connected");
            onAgentUpdated?.();
          } else {
            setPhase("pairing");
          }
        }
      }, 3000);
      return () => clearInterval(pollInterval);
    } else {
      setProvisionDone(true);
      if (channelType === "slack") {
        toast.success("Slack connected");
        setPhase("connected");
        onAgentUpdated?.();
      } else {
        setPhase("pairing");
      }
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
    const ConnectedIcon = CHANNEL_ICONS[existingChannel as ChannelId];
    return (
      <div className="rounded-lg border border-border/50 bg-accent/20 px-4 py-3 flex items-center gap-3">
        {ConnectedIcon ? (
          <ConnectedIcon className={cn("h-4 w-4", CHANNEL_COLORS[existingChannel as ChannelId] ?? "text-muted-foreground")} />
        ) : (
          <span className="text-base">💬</span>
        )}
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
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <MessageSquare className="mr-1.5 inline h-3 w-3" />
        Messaging Channel
      </h2>

      {errorMsg && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {phase === "select" && (
        <div className="grid grid-cols-3 gap-2">
          {CHANNEL_OPTIONS.map((ch) => {
            const Icon = CHANNEL_ICONS[ch.id];
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleSelectChannel(ch.id)}
                className={cn(
                  "group relative flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center transition-all duration-200 cursor-pointer",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.98]",
                  "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg transition-all",
                    "bg-muted/60 group-hover:scale-110",
                  )}
                >
                  <Icon className={cn("h-[18px] w-[18px]", CHANNEL_COLORS[ch.id])} />
                </span>
                <span className="text-[13px] font-medium leading-tight">{ch.label}</span>
                {ch.tag && (
                  <Star className="absolute right-2 top-2 h-3 w-3 fill-foreground/40 text-foreground/40" />
                )}
              </button>
            );
          })}
        </div>
      )}

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

      {phase === "provisioning" && (
        <div className="animate-in fade-in duration-200 flex items-center gap-3 py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-[13px] text-muted-foreground">
            Setting up {channelType === "telegram" ? "Telegram" : "Discord"} bot…
          </span>
        </div>
      )}

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
                <div className="flex items-center gap-2 text-[11px] text-status-info">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Pairing…
                </div>
              )}
              {pairingResult === "done" && (
                <div className="flex items-center gap-2 text-[11px] text-status-success">
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

      {phase === "connected" && !existingChannel && (
        <div className="flex items-center gap-2 text-[13px] text-status-success">
          <Check className="h-4 w-4" />
          Channel connected
        </div>
      )}
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
