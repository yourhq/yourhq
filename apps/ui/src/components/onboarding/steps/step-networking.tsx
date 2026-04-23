"use client";

import { useEffect, useState } from "react";
import { Globe, RefreshCw, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NetworkingStatus } from "@/app/onboarding/actions";

export interface StepNetworkingProps {
  placement: "local" | "remote";
  status: NetworkingStatus | null;
  onSubmit: (useTailscale: boolean) => void;
  onRefresh: () => void | Promise<void>;
  pending: boolean;
}

// On local-gateway + local-UI, Tailscale is optional (the user can reach
// HQ via localhost). On remote-gateway, Tailscale is the recommended path
// because the UI on one machine needs to reach the gateway on another —
// LAN IPs break when laptops move networks.
export function StepNetworking({
  placement,
  status,
  onSubmit,
  onRefresh,
  pending,
}: StepNetworkingProps) {
  const [autoRefreshing, setAutoRefreshing] = useState(false);

  // When user clicks "I've installed it," poll every 2s until we detect
  // Tailscale. Polling stops automatically once status reports both
  // installed + loggedIn; the "checking…" spinner is driven by the
  // presence of the interval, not by a separate piece of state.
  const shouldPoll =
    autoRefreshing && !(status?.installed && status?.loggedIn);
  useEffect(() => {
    if (!shouldPoll) return;
    const t = setInterval(onRefresh, 2000);
    return () => clearInterval(t);
  }, [shouldPoll, onRefresh]);

  const alreadyRunning = status?.installed && status?.loggedIn;
  const installedNotSignedIn = status?.installed && !status?.loggedIn;

  return (
    <div className="space-y-6 pt-6">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-400">
            <Globe className="h-3.5 w-3.5" />
          </div>
          <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Networking
          </span>
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight">
          {placement === "remote"
            ? "Let's set up Tailscale"
            : "Reach HQ from anywhere?"}
        </h1>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          {placement === "remote"
            ? "Your gateway lives on another machine. We'll put both that machine and this one on the same private Tailscale network so they can find each other — even if this laptop moves networks."
            : "HQ currently runs at localhost:3000 on this machine only. Optionally put it on your tailnet so your phone, tablet, or other laptops can reach it too."}
        </p>
      </div>

      {/* Already running — just confirm and move on */}
      {alreadyRunning && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <div className="space-y-1">
              <div className="text-[13px] font-medium">
                Tailscale is already running on this computer
              </div>
              <p className="text-[12px] text-muted-foreground">
                Your tailnet identity:{" "}
                <span className="font-mono text-foreground">
                  {status?.magicDnsName ?? status?.selfHostname}
                </span>
                {status?.selfIp && (
                  <>
                    {" "}
                    ({<span className="font-mono">{status.selfIp}</span>})
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Installed but not signed in */}
      {installedNotSignedIn && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="space-y-2">
            <div className="text-[13px] font-medium">
              Tailscale is installed — you just need to sign in.
            </div>
            <p className="text-[12px] text-muted-foreground">
              Open the Tailscale app (or run <span className="font-mono">sudo tailscale up</span>),
              then click Refresh.
            </p>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] hover:bg-accent/60"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Not installed at all */}
      {status && !status.installed && (
        <div className="space-y-4 rounded-lg border border-border/60 bg-card/60 p-4">
          <div className="text-[13px] font-medium">
            Install Tailscale on this computer
          </div>

          <Instructions />

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setAutoRefreshing(true);
                onRefresh();
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-[12px] font-medium hover:bg-accent/60"
            >
              <RefreshCw
                className={`h-3 w-3 ${autoRefreshing ? "animate-spin" : ""}`}
              />
              {autoRefreshing ? "Checking…" : "I've installed it"}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        {placement === "local" && (
          <button
            type="button"
            onClick={() => onSubmit(false)}
            disabled={pending}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Skip for now →
          </button>
        )}
        {placement === "remote" && <span />}
        <Button
          onClick={() => onSubmit(Boolean(alreadyRunning))}
          disabled={pending || (placement === "remote" && !alreadyRunning)}
        >
          {pending ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function detectOs(): "mac" | "linux" | "win" {
  if (typeof navigator === "undefined") return "mac";
  const ua = navigator.userAgent;
  if (/Win/.test(ua)) return "win";
  if (/Linux/.test(ua)) return "linux";
  return "mac";
}

function Instructions() {
  const [os, setOs] = useState<"mac" | "linux" | "win">(() => detectOs());

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {(["mac", "linux", "win"] as const).map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setOs(x)}
            className={`rounded-md px-2 py-0.5 text-[11px] ${
              os === x
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {x === "mac" ? "macOS" : x === "linux" ? "Linux" : "Windows"}
          </button>
        ))}
      </div>

      {os === "mac" && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Download the Tailscale app and click <span className="font-medium">Sign in</span>.
        </p>
      )}
      {os === "linux" && (
        <div className="space-y-1.5 text-[12px] leading-relaxed text-muted-foreground">
          <p>Run this, then open the URL it prints and sign in:</p>
          <pre className="overflow-auto rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-foreground">
            curl -fsSL https://tailscale.com/install.sh | sh{"\n"}
            sudo tailscale up
          </pre>
        </div>
      )}
      {os === "win" && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Download Tailscale for Windows and sign in with the desktop app.
        </p>
      )}

      <a
        href={
          os === "mac"
            ? "https://tailscale.com/download/mac"
            : os === "win"
              ? "https://tailscale.com/download/windows"
              : "https://tailscale.com/download/linux"
        }
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground hover:underline"
      >
        Open Tailscale download page <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
