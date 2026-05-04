"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type GatewayPlacement = "local" | "remote";

export interface InfraStatus {
  db: "idle" | "validating" | "connected" | "error";
  dbError?: string | null;
  gateway: "idle" | "starting" | "polling" | "connected" | "error";
  gatewayError?: string | null;
}

export interface StepInfrastructureProps {
  status: InfraStatus;
  onValidateDb: (url: string, anonKey: string, serviceRoleKey: string) => void;
  onChooseGateway: (placement: GatewayPlacement) => void;
  onContinue: () => void;
  pending: boolean;
}

export function StepInfrastructure({
  status,
  onValidateDb,
  onChooseGateway,
  onContinue,
  pending,
}: StepInfrastructureProps) {
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [placement, setPlacement] = useState<GatewayPlacement | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const dbReady = status.db === "connected";
  const gwReady = status.gateway === "connected";
  const canContinue = dbReady && gwReady;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Infrastructure
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Connect your services
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          HQ needs a database (Supabase) and a place for agents to run
          (gateway). Both are self-hosted — you own everything.
        </p>
      </div>

      {/* Section A: Database */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">Database</h2>
          {dbReady && <Check className="h-4 w-4 text-green-500" />}
        </div>

        {dbReady ? (
          <div className="rounded-lg border border-green-500/20 bg-green-500/[0.04] px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-green-600">
              <Check className="h-3.5 w-3.5" />
              Connected to Supabase
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">
              HQ stores everything in a Supabase project you control.
            </p>

            <div className="space-y-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Project URL (https://xxx.supabase.co)"
                aria-label="Supabase project URL"
                className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
              />
              <input
                type="password"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="Anon key"
                aria-label="Supabase anon key"
                className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
              />
              <input
                type="password"
                value={serviceRoleKey}
                onChange={(e) => setServiceRoleKey(e.target.value)}
                placeholder="Service role key"
                aria-label="Supabase service role key"
                className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
              />
            </div>

            {status.db === "error" && status.dbError && (
              <div className="flex items-start gap-2 text-[12px] text-destructive">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{status.dbError}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onValidateDb(url, anonKey, serviceRoleKey)}
                disabled={
                  status.db === "validating" ||
                  !url.trim() ||
                  !anonKey.trim() ||
                  !serviceRoleKey.trim()
                }
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
                  status.db === "validating"
                    ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                    : "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1]",
                )}
              >
                {status.db === "validating" ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  "Connect"
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="text-[11px] text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline"
              >
                Need a Supabase account?
              </button>
            </div>

            {showHelp && (
              <div className="rounded-lg border border-border/40 bg-muted/30 px-4 py-3 text-[12px] text-muted-foreground animate-in fade-in duration-200">
                <ol className="list-decimal space-y-1 pl-4">
                  <li>
                    Go to{" "}
                    <span className="font-medium text-foreground">
                      supabase.com
                    </span>{" "}
                    and create a free account
                  </li>
                  <li>Create a new project (any region, free tier is fine)</li>
                  <li>
                    Copy your Project URL + API keys from Settings → API
                  </li>
                </ol>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section B: Gateway */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold">Gateway</h2>
          {gwReady && <Check className="h-4 w-4 text-green-500" />}
        </div>

        {gwReady ? (
          <div className="rounded-lg border border-green-500/20 bg-green-500/[0.04] px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-green-600">
              <Check className="h-3.5 w-3.5" />
              Gateway connected
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[12px] text-muted-foreground">
              The gateway is where your agents run. Pick where to host it.
            </p>

            <div role="radiogroup" aria-label="Gateway placement" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                role="radio"
                aria-checked={placement === "local"}
                onClick={() => {
                  setPlacement("local");
                  onChooseGateway("local");
                }}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  placement === "local"
                    ? "border-foreground/80 bg-foreground/[0.04] ring-1 ring-foreground/10"
                    : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                )}
              >
                <span className="text-[20px]">💻</span>
                <span className="text-[13px] font-medium">This machine</span>
                <span className="text-[11px] text-muted-foreground">
                  Runs via Docker
                </span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={placement === "remote"}
                onClick={() => {
                  setPlacement("remote");
                  onChooseGateway("remote");
                }}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  placement === "remote"
                    ? "border-foreground/80 bg-foreground/[0.04] ring-1 ring-foreground/10"
                    : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                )}
              >
                <span className="text-[20px]">☁️</span>
                <span className="text-[13px] font-medium">Remote server</span>
                <span className="text-[11px] text-muted-foreground">
                  Copy a one-liner
                </span>
              </button>
            </div>

            {status.gateway === "starting" || status.gateway === "polling" ? (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>
                  {status.gateway === "starting"
                    ? "Starting gateway…"
                    : "Waiting for gateway to come online…"}
                </span>
              </div>
            ) : null}

            {status.gateway === "error" && status.gatewayError && (
              <div className="flex items-start gap-2 text-[12px] text-destructive">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{status.gatewayError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Continue */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue || pending}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
            !canContinue || pending
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {pending ? "Saving…" : "Continue"}
          {!pending && canContinue && (
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </div>
    </div>
  );
}
