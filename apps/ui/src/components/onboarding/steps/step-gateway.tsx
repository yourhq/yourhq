"use client";

import { useState } from "react";
import {
  Server,
  Terminal,
  Copy,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Laptop,
  ArrowRight,
  Sparkles,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GatewayBootstrap } from "@/app/onboarding/actions";

export interface StepGatewayProps {
  // Selected placement, or null when the user hasn't picked yet (the
  // first phase of the step asks them to).
  placement: "local" | "remote" | null;
  bootstrap: GatewayBootstrap | null;
  // When the UI can't start the compose profile itself (Docker socket
  // not mounted, perms issue, Codespaces etc.), we switch to a "run
  // this in your terminal" fallback. Non-null `localError` means fallback mode.
  localError: string | null;
  onChoosePlacement: (placement: "local" | "remote") => void;
  onProvideTailscaleKey: (key: string) => void;
  onContinue: () => void;
  onRegenerateToken: () => void;
  /**
   * Resets placement + clears any in-flight gateway state. Lets the
   * user flip between local and remote without using the global Back
   * button (which would walk them back through Account / Supabase).
   */
  onChangePlacement: () => void;
  pending: boolean;
}

// Sub-phases of the Gateway step:
//
//   1. choose      — placement tiles (local vs. remote)
//   2. tailscale   — remote only: paste Tailscale auth key
//   3. boot        — kick off the boot sequence (parent component runs the
//                    actual provisioning effect)
//
// Local + boot succeeded            → "Gateway is running ✓"
// Local + Docker unreachable        → manual "run this in your terminal"
// Remote + has token + waiting      → one-liner + spinner
// Remote + token expired            → regenerate
// Either + online                   → green check, Continue button

export function StepGateway({
  placement,
  bootstrap,
  localError,
  onChoosePlacement,
  onProvideTailscaleKey,
  onContinue,
  onRegenerateToken,
  onChangePlacement,
  pending,
}: StepGatewayProps) {
  const [tailscaleKey, setTailscaleKey] = useState("");
  const online = Boolean(bootstrap?.gatewayOnline);

  // Phase 1: pick placement
  if (!placement) {
    return (
      <PlacementPhase
        initial={null}
        onChoose={onChoosePlacement}
        pending={pending}
      />
    );
  }

  // Phase 2: Tailscale auth key for remote (skipped if already provided)
  const remoteNeedsTailscale =
    placement === "remote" && !bootstrap?.token && !bootstrap?.gatewayOnline;
  if (remoteNeedsTailscale) {
    return (
      <TailscalePhase
        tailscaleKey={tailscaleKey}
        onChangeKey={setTailscaleKey}
        onSubmit={() => onProvideTailscaleKey(tailscaleKey.trim())}
        onSkip={() => onProvideTailscaleKey("")}
        onChangePlacement={onChangePlacement}
        pending={pending}
      />
    );
  }

  // Phase 3: boot / waiting / done
  return <BootPhase
    placement={placement}
    bootstrap={bootstrap}
    online={online}
    localError={localError}
    onContinue={onContinue}
    onRegenerateToken={onRegenerateToken}
    onChangePlacement={onChangePlacement}
    pending={pending}
  />;
}

// ─── Phase 1: placement ─────────────────────────────────────────────

function PlacementPhase({
  initial,
  onChoose,
  pending,
}: {
  initial: "local" | "remote" | null;
  onChoose: (p: "local" | "remote") => void;
  pending: boolean;
}) {
  const [choice, setChoice] = useState<"local" | "remote" | null>(initial);

  return (
    <div className="space-y-10 pt-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Gateway
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Where should your agents run?
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
          onClick={() => choice && onChoose(choice)}
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
            selected ? "bg-foreground text-background" : "bg-muted/60 text-foreground",
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

// ─── Phase 2: Tailscale auth key (remote only) ──────────────────────

function TailscalePhase({
  tailscaleKey,
  onChangeKey,
  onSubmit,
  onSkip,
  onChangePlacement,
  pending,
}: {
  tailscaleKey: string;
  onChangeKey: (k: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onChangePlacement: () => void;
  pending: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (tailscaleKey.trim()) onSubmit();
      }}
      className="space-y-10 pt-8"
    >
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Gateway · Tailscale
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Connect to your Tailscale network.
        </h1>
        <p className="max-w-[48ch] text-[14px] leading-relaxed text-muted-foreground">
          Your remote gateway joins your Tailscale network so this UI can
          reach it from anywhere. Free for personal use, takes 2 minutes
          if you don&apos;t have an account.
        </p>
      </div>

      <a
        href="https://login.tailscale.com/admin/settings/keys"
        target="_blank"
        rel="noreferrer"
        className="group flex items-center gap-3 rounded-xl border border-border/60 bg-gradient-to-br from-blue-500/[0.06] to-card/40 p-4 transition-all hover:border-blue-500/40"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
          <ExternalLink className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">
            Generate an auth key
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            login.tailscale.com → Settings → Keys → Generate auth key
          </div>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
      </a>

      <div className="space-y-2.5">
        <label className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
          <KeyRound className="h-3.5 w-3.5" />
          Tailscale auth key
        </label>
        <input
          type="password"
          value={tailscaleKey}
          onChange={(e) => onChangeKey(e.target.value)}
          placeholder="tskey-auth-…"
          spellCheck={false}
          autoComplete="off"
          className="w-full border-0 border-b border-border/60 bg-transparent pb-2 font-mono text-[13px] outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground"
        />
        <p className="text-[11px] text-muted-foreground/60">
          Single-use, 90-day expiry. Embedded into the install command on
          the next screen and not stored anywhere on our side.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!tailscaleKey.trim() || pending}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
            !tailscaleKey.trim() || pending
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {pending ? "Saving…" : "Continue"}
          {!pending && (
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          I&apos;ll set up Tailscale later →
        </button>
        <button
          type="button"
          onClick={onChangePlacement}
          className="ml-auto text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← Run on this machine instead
        </button>
      </div>
    </form>
  );
}

// ─── Phase 3: boot / waiting / done ─────────────────────────────────

function BootPhase({
  placement,
  bootstrap,
  online,
  localError,
  onContinue,
  onRegenerateToken,
  onChangePlacement,
  pending,
}: {
  placement: "local" | "remote";
  bootstrap: GatewayBootstrap | null;
  online: boolean;
  localError: string | null;
  onContinue: () => void;
  onRegenerateToken: () => void;
  onChangePlacement: () => void;
  pending: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="space-y-6 pt-6">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-500/10 text-purple-400">
            <Server className="h-3.5 w-3.5" />
          </div>
          <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Gateway
          </span>
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight">
          {placement === "local"
            ? "Starting your gateway"
            : "Connect your gateway"}
        </h1>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          {placement === "local"
            ? "Pulling the agent runtime and starting it on this machine. This can take a minute on the first run (~2 GB download)."
            : "Run this command on the machine where agents should live. The gateway joins your tailnet and registers itself here."}
        </p>
      </div>

      {placement === "local" && (
        <LocalView online={online} localError={localError} onCopy={copy} copied={copied} />
      )}

      {placement === "remote" && (
        <RemoteView
          bootstrap={bootstrap}
          online={online}
          copied={copied}
          onCopy={copy}
          onRegenerate={onRegenerateToken}
          pending={pending}
        />
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onChangePlacement}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← {placement === "local"
            ? "Run on another machine instead"
            : "Run on this machine instead"}
        </button>
        <Button onClick={onContinue} disabled={!online || pending}>
          {pending ? "…" : online ? "Continue" : "Waiting for gateway…"}
        </Button>
      </div>
    </div>
  );
}

function LocalView({
  online,
  localError,
  onCopy,
  copied,
}: {
  online: boolean;
  localError: string | null;
  onCopy: (s: string) => void;
  copied: boolean;
}) {
  if (online) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <div className="space-y-1">
              <div className="text-[13px] font-medium">
                Gateway is running on this machine
              </div>
              <p className="text-[12px] text-muted-foreground">
                Your agents now have a place to live and work.
              </p>
            </div>
          </div>
        </div>
        <ModelProviderHint />
      </div>
    );
  }

  if (localError) {
    const cmd = "docker compose --profile gateway up -d";
    return (
      <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <div className="space-y-1">
          <div className="text-[13px] font-medium">
            We couldn&apos;t start the gateway automatically
          </div>
          <p className="text-[12px] text-muted-foreground">
            This usually means the UI container can&apos;t reach the Docker
            socket (common in Codespaces). Run this in your terminal on the
            machine where HQ lives — it&apos;s the same command we would
            have run for you:
          </p>
        </div>

        <pre className="overflow-auto rounded-md border border-border/60 bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
          {cmd}
        </pre>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onCopy(cmd)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] hover:bg-accent/60"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy command
              </>
            )}
          </button>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Waiting for gateway…
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground/70">
          Details: {localError}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-4">
      <div className="flex items-start gap-2.5">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-foreground/70" />
        <div className="space-y-1">
          <div className="text-[13px] font-medium">Starting gateway containers…</div>
          <p className="text-[12px] text-muted-foreground">
            Downloading images (gateway, dispatcher, runner). This only
            happens once.
          </p>
        </div>
      </div>
    </div>
  );
}

function RemoteView({
  bootstrap,
  online,
  copied,
  onCopy,
  onRegenerate,
  pending,
}: {
  bootstrap: GatewayBootstrap | null;
  online: boolean;
  copied: boolean;
  onCopy: (s: string) => void;
  onRegenerate: () => void;
  pending: boolean;
}) {
  if (online) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <div className="space-y-1">
              <div className="text-[13px] font-medium">Gateway connected</div>
              <p className="text-[12px] text-muted-foreground">
                Your gateway is registered and ready. You can view it
                anytime in Settings → Gateways.
              </p>
            </div>
          </div>
        </div>
        <ModelProviderHint />
      </div>
    );
  }

  if (!bootstrap?.token) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/60 p-4">
        <div className="flex items-start gap-2.5">
          {bootstrap === null ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-foreground/70" />
          ) : (
            <span className="mt-0.5 h-4 w-4 shrink-0 text-amber-500">⏳</span>
          )}
          <div className="space-y-2">
            <div className="text-[13px] font-medium">
              {bootstrap === null ? "Generating registration token…" : "Token expired"}
            </div>
            {bootstrap && !bootstrap.token && (
              <>
                <p className="text-[12px] text-muted-foreground">
                  Registration tokens last 15 minutes. Generate a new one:
                </p>
                <Button size="sm" onClick={onRegenerate} disabled={pending}>
                  Generate new token
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-4">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-[13px] font-medium">
            Run this on the machine where agents should live
          </span>
        </div>
        <pre className="overflow-auto rounded-md border border-border/60 bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
          {bootstrap.oneLiner}
        </pre>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onCopy(bootstrap.oneLiner ?? "")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] hover:bg-accent/60"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy command
              </>
            )}
          </button>
          <span className="text-[11px] text-muted-foreground/70">
            Token expires in 15 minutes.
          </span>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-md border border-border/40 px-3 py-2">
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-foreground/70" />
        <div className="space-y-0.5">
          <div className="text-[12px]">Waiting for gateway to connect…</div>
          <p className="text-[11px] text-muted-foreground">
            When the remote machine runs the command, its gateway will
            register here automatically.
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Model provider hint ─────────────────────────────────────────────
//
// Shown after the gateway comes online. Agents need an AI model to
// run, and the proper Connections UI ships in Phase 3.4. Until then
// users have to set this up manually via the gateway shell. We surface
// the gap here so it doesn't show up as a confusing failure later.

function ModelProviderHint() {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start gap-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div className="space-y-2">
          <div className="text-[13px] font-medium">
            One more thing: connect an AI model
          </div>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Agents need access to a language model to think — Claude, GPT,
            Gemini, etc. The in-browser setup for this is shipping shortly.
            Until then, run this on your gateway machine after onboarding:
          </p>
          <pre className="overflow-auto rounded-md border border-border/60 bg-background p-2 font-mono text-[10.5px] leading-relaxed">
{`docker compose exec gateway \\
  openclaw models auth login --provider openai-codex --set-default`}
          </pre>
          <p className="text-[11px] text-muted-foreground/70">
            Replace{" "}
            <code className="rounded bg-muted px-1 font-mono text-[10px]">
              openai-codex
            </code>{" "}
            with{" "}
            <code className="rounded bg-muted px-1 font-mono text-[10px]">
              anthropic
            </code>
            ,{" "}
            <code className="rounded bg-muted px-1 font-mono text-[10px]">
              gemini
            </code>
            , etc. for other providers. You can finish onboarding now and
            do this after.
          </p>
        </div>
      </div>
    </div>
  );
}
