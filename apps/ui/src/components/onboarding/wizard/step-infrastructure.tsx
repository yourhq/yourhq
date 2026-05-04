"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2, AlertCircle, ExternalLink, Copy, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type GatewayPlacement = "local" | "remote";

export interface InfraStatus {
  db: "idle" | "validating" | "schema-needed" | "connected" | "error";
  dbError?: string | null;
  gateway: "idle" | "starting" | "polling" | "connected" | "error";
  gatewayError?: string | null;
  gatewayManualCmd?: string;
}

export interface SchemaInstallState {
  phase: "idle" | "needed" | "running" | "confirming";
  projectRef?: string | null;
  sqlEditorUrl?: string;
  sql?: string;
  error?: string | null;
  hint?: string | null;
}

export interface StepInfrastructureProps {
  status: InfraStatus;
  schemaInstall: SchemaInstallState;
  onValidateDb: (url: string, anonKey: string, serviceRoleKey: string) => void;
  onRunOneClick: (region: string, dbPassword: string) => void;
  onConfirmSchema: () => void;
  onChooseGateway: (placement: GatewayPlacement) => void;
  onContinue: () => void;
  pending: boolean;
}

const SUPABASE_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "EU West (Ireland)" },
  { value: "eu-west-2", label: "EU West (London)" },
  { value: "eu-central-1", label: "EU Central (Frankfurt)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
  { value: "sa-east-1", label: "South America (São Paulo)" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
      aria-label="Copy"
    >
      {copied ? <CheckCheck className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function SchemaInstallPanel({
  schemaInstall,
  onRunOneClick,
  onConfirmSchema,
}: {
  schemaInstall: SchemaInstallState;
  onRunOneClick: (region: string, dbPassword: string) => void;
  onConfirmSchema: () => void;
}) {
  const [region, setRegion] = useState("us-east-1");
  const [dbPassword, setDbPassword] = useState("");
  const [showManual, setShowManual] = useState(false);

  const busy = schemaInstall.phase === "running" || schemaInstall.phase === "confirming";

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-4">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium text-foreground">Schema not installed</p>
          <p className="text-[12px] text-muted-foreground">
            HQ needs its database schema installed in this Supabase project.
            Enter your database password to install it automatically, or use the SQL editor.
          </p>
        </div>
      </div>

      {!showManual ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Region
            </label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={busy}
              className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] outline-none transition-colors focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10 disabled:opacity-50"
            >
              {SUPABASE_REGIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Database password
            </label>
            <input
              type="password"
              value={dbPassword}
              onChange={(e) => setDbPassword(e.target.value)}
              placeholder="The password you set when creating the project"
              disabled={busy}
              className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10 disabled:opacity-50"
            />
            <p className="text-[11px] text-muted-foreground/60">
              Found in Supabase → Settings → Database → Connection string. Not your Supabase account password.
            </p>
          </div>

          {schemaInstall.error && (
            <div className="space-y-0.5">
              <p className="text-[12px] text-destructive">{schemaInstall.error}</p>
              {schemaInstall.hint && (
                <p className="text-[11px] text-muted-foreground">{schemaInstall.hint}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onRunOneClick(region, dbPassword)}
              disabled={busy || !dbPassword.trim()}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-medium transition-all",
                busy || !dbPassword.trim()
                  ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                  : "bg-foreground/[0.08] text-foreground hover:bg-foreground/[0.13]",
              )}
            >
              {schemaInstall.phase === "running" ? (
                <><Loader2 className="h-3 w-3 animate-spin" />Installing…</>
              ) : "Install schema"}
            </button>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="text-[11px] text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline"
            >
              Use SQL editor instead
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">
            Open your Supabase SQL editor, paste the script below, and click{" "}
            <span className="font-medium text-foreground">Run</span>. Then come back and confirm.
          </p>

          {schemaInstall.sqlEditorUrl && (
            <a
              href={schemaInstall.sqlEditorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-card/70"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open SQL editor
            </a>
          )}

          {schemaInstall.sql && (
            <div className="relative rounded-lg border border-border/40 bg-muted/30">
              <div className="absolute right-2 top-2">
                <CopyButton text={schemaInstall.sql} />
              </div>
              <pre className="max-h-40 overflow-y-auto px-3 py-3 pr-8 text-[11px] leading-relaxed text-muted-foreground">
                {schemaInstall.sql.slice(0, 600)}{schemaInstall.sql.length > 600 ? "\n…(truncated)" : ""}
              </pre>
            </div>
          )}

          {schemaInstall.error && (
            <div className="space-y-0.5">
              <p className="text-[12px] text-destructive">{schemaInstall.error}</p>
              {schemaInstall.hint && (
                <p className="text-[11px] text-muted-foreground">{schemaInstall.hint}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onConfirmSchema}
              disabled={busy}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-medium transition-all",
                busy
                  ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                  : "bg-foreground/[0.08] text-foreground hover:bg-foreground/[0.13]",
              )}
            >
              {schemaInstall.phase === "confirming" ? (
                <><Loader2 className="h-3 w-3 animate-spin" />Checking…</>
              ) : "I ran it — verify"}
            </button>
            <button
              type="button"
              onClick={() => setShowManual(false)}
              className="text-[11px] text-muted-foreground/70 underline-offset-2 hover:text-muted-foreground hover:underline"
            >
              Use auto-install instead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StepInfrastructure({
  status,
  schemaInstall,
  onValidateDb,
  onRunOneClick,
  onConfirmSchema,
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
                placeholder="Publishable key"
                aria-label="Supabase publishable key"
                className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
              />
              <input
                type="password"
                value={serviceRoleKey}
                onChange={(e) => setServiceRoleKey(e.target.value)}
                placeholder="Secret key"
                aria-label="Supabase secret key"
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
                    <span className="font-medium text-foreground">supabase.com</span>{" "}
                    and create a free account
                  </li>
                  <li>Create a new project (any region, free tier is fine)</li>
                  <li>Copy your Project URL + API keys from Settings → Data API</li>
                </ol>
              </div>
            )}

            {/* Schema install sub-flow */}
            {status.db === "schema-needed" && schemaInstall.phase !== "idle" && (
              <SchemaInstallPanel
                schemaInstall={schemaInstall}
                onRunOneClick={onRunOneClick}
                onConfirmSchema={onConfirmSchema}
              />
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
                <span className="text-[11px] text-muted-foreground">Runs via Docker</span>
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
                <span className="text-[11px] text-muted-foreground">Copy a one-liner</span>
              </button>
            </div>

            {(status.gateway === "starting" || status.gateway === "polling") && (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>
                  {status.gateway === "starting"
                    ? "Starting gateway…"
                    : "Waiting for gateway to come online…"}
                </span>
              </div>
            )}

            {status.gateway === "error" && (
              <div className="space-y-2">
                {status.gatewayError && (
                  <div className="flex items-start gap-2 text-[12px] text-destructive">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{status.gatewayError}</span>
                  </div>
                )}
                {status.gatewayManualCmd && (
                  <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2.5">
                    <p className="mb-1.5 text-[11px] text-muted-foreground">
                      Run this command from the directory where you installed HQ:
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-[12px] text-foreground">{status.gatewayManualCmd}</code>
                      <CopyButton text={status.gatewayManualCmd} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground/60">
                      Once the gateway starts it will register automatically and this page will update.
                    </p>
                  </div>
                )}
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
