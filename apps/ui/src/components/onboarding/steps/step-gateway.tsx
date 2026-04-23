"use client";

import { useState } from "react";
import {
  Server,
  Terminal,
  Copy,
  CheckCircle2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GatewayBootstrap } from "@/app/onboarding/actions";

export interface StepGatewayProps {
  placement: "local" | "remote";
  bootstrap: GatewayBootstrap | null;
  onContinue: () => void;
  onRegenerateToken: () => void;
  pending: boolean;
}

// The three gateway-bootstrap substates map to three distinct UIs:
//
//   local + no bootstrap yet         → "Starting gateway containers…"
//   local + running, not online      → "Waiting for gateway to register…"
//   local + online                   → "Gateway ready ✓"
//
//   remote + no token yet            → "Generating token…"
//   remote + token, not online       → one-liner + spinner
//   remote + online                  → "Gateway connected from ip ✓"

export function StepGateway({
  placement,
  bootstrap,
  onContinue,
  onRegenerateToken,
  pending,
}: StepGatewayProps) {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const online = Boolean(bootstrap?.gatewayOnline);

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

      {placement === "local" && <LocalView online={online} />}

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

      <div className="flex items-center justify-end pt-2">
        <Button onClick={onContinue} disabled={!online || pending}>
          {pending ? "…" : online ? "Continue" : "Waiting for gateway…"}
        </Button>
      </div>
    </div>
  );
}

function LocalView({ online }: { online: boolean }) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-4">
      <div className="flex items-start gap-2.5">
        {online ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-foreground/70" />
        )}
        <div className="space-y-1">
          <div className="text-[13px] font-medium">
            {online
              ? "Gateway is running on this machine"
              : "Starting gateway containers…"}
          </div>
          <p className="text-[12px] text-muted-foreground">
            {online
              ? "Agents can now be created and run."
              : "Downloading images (gateway, dispatcher, runner). This only happens once."}
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
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <div className="space-y-1">
            <div className="text-[13px] font-medium">Gateway connected</div>
            <p className="text-[12px] text-muted-foreground">
              Your gateway is registered and ready. You can view it in
              Settings → Gateways after onboarding.
            </p>
          </div>
        </div>
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

      <a
        href="https://login.tailscale.com/admin/settings/keys"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        Need a Tailscale auth key? <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </>
  );
}
