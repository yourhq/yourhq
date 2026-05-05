"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowRight, Loader2, Check, ExternalLink, AlertCircle, Clipboard } from "lucide-react";
import { cn } from "@/lib/utils";

type SubPhase = "meet" | "name" | "channel" | "pairing";

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

type ChannelId = "telegram" | "discord" | "slack";

const CHANNEL_OPTIONS: { id: ChannelId; label: string; icon: string; description: string }[] = [
  { id: "telegram", label: "Telegram", icon: "✈️", description: "Fastest setup — create a bot with @BotFather and connect in seconds." },
  { id: "discord", label: "Discord", icon: "🎮", description: "Create a bot in the Developer Portal and invite it to your server." },
  { id: "slack", label: "Slack", icon: "💬", description: "Create a Slack App and install it to your workspace." },
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
  onConnectChannel: (data: {
    agentId: string;
    agentSlug: string;
    channel: ChannelId;
    token: string;
    extras?: Record<string, string>;
  }) => Promise<{ provisionCommandId: string } | null>;
  onSubmitPairing: (data: {
    agentId: string;
    agentSlug: string;
    channel: ChannelId;
    pairingCode: string;
  }) => Promise<boolean>;
  onSkipChannel: () => void;
  provisionStatus: "idle" | "provisioning" | "ready" | "error";
  provisionError?: string | null;
  pairingStatus: "idle" | "submitting" | "done" | "error";
  pairingError?: string | null;
  pending: boolean;
}

export function StepAgent({
  recommendation,
  onCreateAgent,
  onConnectChannel,
  onSubmitPairing,
  onSkipChannel,
  provisionStatus,
  provisionError,
  pairingStatus,
  pairingError,
  pending,
}: StepAgentProps) {
  const [phase, setPhase] = useState<SubPhase>("meet");
  const [agentName, setAgentName] = useState(recommendation.name);
  const [agentEmoji, setAgentEmoji] = useState(recommendation.emoji);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentSlug, setAgentSlug] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Channel state
  const [channelType, setChannelType] = useState<ChannelId | null>(null);
  const [botToken, setBotToken] = useState("");
  const [discordServerId, setDiscordServerId] = useState("");
  const [discordUserId, setDiscordUserId] = useState("");
  const [slackAppToken, setSlackAppToken] = useState("");
  const [slackBotToken, setSlackBotToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Pairing state
  const [pairingCode, setPairingCode] = useState("");
  const pairingInputRef = useRef<HTMLInputElement>(null);

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
      const slug = (agentName.trim() || recommendation.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30) || "agent";
      setAgentSlug(slug);
      setPhase("channel");
    }
  }, [agentName, agentEmoji, recommendation, onCreateAgent]);

  const handleConnectChannel = useCallback(async () => {
    if (!agentId || !agentSlug || !channelType) return;
    setConnecting(true);

    const extras: Record<string, string> = {};
    if (channelType === "discord") {
      if (discordServerId.trim()) extras.discord_server_id = discordServerId.trim();
      if (discordUserId.trim()) extras.discord_user_id = discordUserId.trim();
    }

    const result = await onConnectChannel({
      agentId,
      agentSlug,
      channel: channelType,
      token: channelType === "slack" ? slackAppToken.trim() : botToken.trim(),
      extras: {
        ...extras,
        ...(channelType === "slack" ? { slack_bot_token: slackBotToken.trim() } : {}),
      },
    });
    setConnecting(false);

    if (result) {
      if (channelType === "slack") {
        // Slack doesn't use pairing — skip straight to done
        onSkipChannel();
      } else {
        setPhase("pairing");
      }
    }
  }, [agentId, agentSlug, channelType, botToken, discordServerId, discordUserId, slackAppToken, slackBotToken, onConnectChannel, onSkipChannel]);

  const handleSubmitPairing = useCallback(async () => {
    if (!agentId || !agentSlug || !channelType || !pairingCode.trim()) return;
    await onSubmitPairing({
      agentId,
      agentSlug,
      channel: channelType,
      pairingCode: pairingCode.trim(),
    });
  }, [agentId, agentSlug, channelType, pairingCode, onSubmitPairing]);

  useEffect(() => {
    if (phase === "pairing") {
      pairingInputRef.current?.focus();
    }
  }, [phase]);

  const channelTokenValid = (() => {
    if (!channelType) return false;
    if (channelType === "telegram") return botToken.trim().length > 20;
    if (channelType === "discord") return botToken.trim().length > 20;
    if (channelType === "slack") return slackAppToken.trim().length > 10 && slackBotToken.trim().length > 10;
    return false;
  })();

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
              <span className="text-[48px] leading-none">{recommendation.emoji}</span>
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
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background transition-all hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2"
          >
            Let&apos;s get started
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
                : "bg-foreground text-background hover:bg-foreground/90",
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

      {phase === "channel" && (
        <div className="space-y-6">
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

          {/* Provision status */}
          {provisionStatus !== "idle" && (
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
          )}

          {/* Channel selection */}
          <div className="space-y-2">
            {CHANNEL_OPTIONS.map((ch) => {
              const selected = channelType === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    setChannelType(selected ? null : ch.id);
                    setBotToken("");
                    setSlackAppToken("");
                    setSlackBotToken("");
                    setDiscordServerId("");
                    setDiscordUserId("");
                  }}
                  className={cn(
                    "w-full flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150 cursor-pointer",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
                    selected
                      ? "border-foreground/60 bg-foreground/[0.04] ring-1 ring-foreground/10"
                      : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                  )}
                >
                  <span className="mt-0.5 text-[16px]">{ch.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium">{ch.label}</span>
                      {ch.id === "telegram" && (
                        <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground/70 leading-relaxed">
                      {ch.description}
                    </p>
                  </div>
                  {selected && (
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Channel-specific credential form */}
          {channelType && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200 rounded-xl border border-border/40 bg-card/20 overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] divide-x divide-border/30">
                {/* Left: form */}
                <div className="p-4 space-y-3">
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

                {/* Right: instructions */}
                <div className="w-48 shrink-0 p-4">
                  <p className="mb-3 text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium">
                    How to get it
                  </p>
                  {channelType === "telegram" && (
                    <InstructionSteps items={[
                      <>Open Telegram and message{" "}
                        <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-foreground underline decoration-border hover:decoration-foreground">
                          @BotFather
                        </a>
                      </>,
                      <>Send <span className="font-mono text-foreground">/newbot</span></>,
                      "Follow the prompts to name your bot",
                      "Copy the token it replies with and paste it here",
                    ]} />
                  )}
                  {channelType === "discord" && (
                    <InstructionSteps items={[
                      <><a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-foreground underline decoration-border hover:decoration-foreground">Developer Portal</a> → New Application</>,
                      <>Bot → <span className="text-foreground">Reset Token</span></>,
                      <>Enable <span className="text-foreground">Message Content</span> Intent</>,
                      "OAuth2 → invite to your server",
                    ]} />
                  )}
                  {channelType === "slack" && (
                    <InstructionSteps items={[
                      <><a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="text-foreground underline decoration-border hover:decoration-foreground">api.slack.com/apps</a> → Create New App</>,
                      "Enable Socket Mode → generate App-Level Token",
                      "OAuth & Permissions → install to workspace",
                      "Copy the Bot User OAuth Token",
                    ]} />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            {channelType && channelTokenValid ? (
              <button
                type="button"
                onClick={handleConnectChannel}
                disabled={connecting || pending}
                className={cn(
                  "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
                  connecting || pending
                    ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                    : "bg-foreground text-background hover:bg-foreground/90",
                )}
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    Connect {channelType === "telegram" ? "Telegram" : channelType === "discord" ? "Discord" : "Slack"}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onSkipChannel}
                className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background transition-all hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2"
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
      )}

      {phase === "pairing" && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
              Pairing
            </div>
            <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
              Pair with {displayName}
            </h1>
            <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
              {channelType === "telegram"
                ? "Your Telegram bot is being set up. Once it's ready, send it /start to get your pairing code."
                : "Your Discord bot is being set up. Once it's ready, DM the bot to get your pairing code."}
            </p>
          </div>

          {/* Provision status for pairing phase */}
          {provisionStatus === "provisioning" && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-[12px] text-blue-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span>Setting up your {channelType === "telegram" ? "Telegram" : "Discord"} bot — this takes about 30 seconds…</span>
            </div>
          )}
          {provisionStatus === "ready" && (
            <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3 text-[12px] text-green-400">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span>Bot is running and ready for pairing</span>
            </div>
          )}
          {provisionStatus === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-[12px] text-red-400">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Bot setup failed{provisionError ? `: ${provisionError}` : ""}. You can skip and set up the channel later from Settings.</span>
            </div>
          )}

          <div className="grid grid-cols-5 gap-4">
            {/* Left: pairing code input */}
            <div className="col-span-3 space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-medium">
                  Pairing code
                </label>
                <input
                  ref={pairingInputRef}
                  type="text"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pairingCode.trim()) handleSubmitPairing();
                  }}
                  placeholder="••••••"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={provisionStatus !== "ready"}
                  className={cn(
                    "mt-1.5 w-full h-12 rounded-lg border border-border/50 bg-transparent px-3 text-center font-mono text-lg tracking-[0.5em] outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/30 placeholder:tracking-[0.5em]",
                    provisionStatus !== "ready" && "opacity-50 cursor-not-allowed",
                  )}
                />
                <div className="mt-1.5 text-[11px] text-muted-foreground/50">
                  {provisionStatus !== "ready"
                    ? "Waiting for bot to be ready…"
                    : pairingCode.trim()
                      ? "Press Enter to pair"
                      : "Enter the code your bot replied with"}
                </div>
              </div>

              {/* Pairing status */}
              {pairingStatus === "submitting" && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-[11px] text-blue-400">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  <span>Pairing in progress…</span>
                </div>
              )}
              {pairingStatus === "error" && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    {pairingError?.includes("timed out")
                      ? "Pairing is taking longer than expected. If you can already message your bot, it worked — click Continue below."
                      : `Pairing failed${pairingError ? `: ${pairingError}` : ""}. Double-check the code and try again.`}
                  </span>
                </div>
              )}
              {pairingStatus === "done" && (
                <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2 text-[11px] text-green-400">
                  <Check className="h-3 w-3 shrink-0" />
                  <span>Paired successfully!</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmitPairing}
                disabled={!pairingCode.trim() || pairingStatus === "submitting" || provisionStatus !== "ready"}
                className={cn(
                  "w-full h-9 rounded-lg text-[12px] font-medium transition-all",
                  !pairingCode.trim() || pairingStatus === "submitting" || provisionStatus !== "ready"
                    ? "bg-muted text-muted-foreground/40 cursor-not-allowed"
                    : "bg-foreground text-background hover:bg-foreground/90",
                )}
              >
                {pairingStatus === "submitting" ? "Pairing…" : "Submit pairing code"}
              </button>
            </div>

            {/* Right: instructions */}
            <div className="col-span-2 rounded-xl border border-border/40 bg-card/20 p-4">
              <div className="text-[11px] font-medium text-foreground mb-3">
                Get your pairing code
              </div>
              {channelType === "telegram" && (
                <>
                  <InstructionSteps items={[
                    "Open Telegram and find the bot you just created",
                    <>Send <span className="font-mono text-foreground">/start</span></>,
                    "Copy the code it replies with",
                    "Paste it on the left and press Enter",
                  ]} />
                  <a
                    href="https://t.me/"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-[11px] text-foreground underline decoration-border hover:decoration-foreground"
                  >
                    Open Telegram
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
              {channelType === "discord" && (
                <InstructionSteps items={[
                  "Open Discord and DM the bot you just invited",
                  "The bot will reply with a pairing code",
                  "Copy the code and paste it on the left",
                  "Press Enter to pair",
                ]} />
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            {pairingStatus === "done" || pairingStatus === "error" ? (
              <button
                type="button"
                onClick={onSkipChannel}
                className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background transition-all hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2"
              >
                Continue
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSkipChannel}
                className="inline-flex items-center gap-2 rounded-full border border-border/60 px-5 py-2.5 text-[13px] font-medium text-muted-foreground transition-all hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2"
              >
                Skip pairing — I&apos;ll do it later
              </button>
            )}
          </div>
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
    <ol className="space-y-2">
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
