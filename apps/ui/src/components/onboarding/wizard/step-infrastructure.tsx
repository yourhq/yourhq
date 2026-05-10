"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRight, Check, Loader2, AlertCircle, ExternalLink, Copy, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConceptExplainer } from "./concept-explainer";

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
          <p className="text-[13px] font-medium text-foreground">Your database needs HQ&apos;s tables</p>
          <p className="text-[12px] text-muted-foreground">
            HQ needs to create its tables in your Supabase database.
            This is automatic and takes about 30 seconds, or you can run the SQL manually.
          </p>
        </div>
      </div>

      {/* Two-path layout: auto + manual side by side on desktop */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Auto-install path */}
        <div className={cn(
          "space-y-3 rounded-lg border p-4 transition-all",
          !showManual
            ? "border-foreground/20 bg-foreground/[0.02]"
            : "border-border/40 bg-transparent cursor-pointer hover:border-border/60",
        )}>
          <button
            type="button"
            onClick={() => setShowManual(false)}
            className="text-[12px] font-semibold text-foreground"
          >
            Automatic install
          </button>
          {!showManual && (
            <div className="space-y-3 animate-in fade-in duration-200">
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
                  placeholder="Your Supabase database password"
                  disabled={busy}
                  className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10 disabled:opacity-50"
                />
                <p className="text-[11px] text-muted-foreground/60">
                  Set when you created the project. Find it in Settings → Database.
                </p>
              </div>

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
            </div>
          )}
        </div>

        {/* Manual SQL path */}
        <div className={cn(
          "space-y-3 rounded-lg border p-4 transition-all",
          showManual
            ? "border-foreground/20 bg-foreground/[0.02]"
            : "border-border/40 bg-transparent cursor-pointer hover:border-border/60",
        )}>
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="text-[12px] font-semibold text-foreground"
          >
            Manual SQL
          </button>
          {showManual && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <p className="text-[12px] text-muted-foreground">
                Open your Supabase SQL editor, paste the script below, and click{" "}
                <span className="font-medium text-foreground">Run</span>.
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
            </div>
          )}
        </div>
      </div>

      {schemaInstall.error && (
        <div className="space-y-0.5">
          <p className="text-[12px] text-destructive">{schemaInstall.error}</p>
          {schemaInstall.hint && (
            <p className="text-[11px] text-muted-foreground">{schemaInstall.hint}</p>
          )}
        </div>
      )}
    </div>
  );
}

function GatewayPollingMessage({ status }: { status: "starting" | "polling" }) {
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  let message: string;
  if (elapsed < 10) {
    message = "Starting gateway…";
  } else if (elapsed < 30) {
    message = "Connecting to your database…";
  } else {
    message = "Taking longer than usual. Make sure Docker is running.";
  }

  return (
    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{message}</span>
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
          Connect your infrastructure
        </h1>
        <p className="max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
          Your agents need somewhere to store data and somewhere to run.
          You&apos;ll set up both here — you own everything.
        </p>
      </div>

      {/* ── Section A: Database ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-300",
            dbReady
              ? "bg-green-500 text-white"
              : "bg-foreground text-background",
          )}>
            {dbReady ? <Check className="h-3 w-3" strokeWidth={3} /> : "1"}
          </div>
          <h2 className="text-[15px] font-semibold">Database</h2>
        </div>

        {dbReady ? (
          <div className="rounded-xl border border-green-500/20 bg-green-500/[0.04] px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-green-600">
              <Check className="h-3.5 w-3.5" />
              Connected to Supabase
            </div>
            {url && (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{url}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <ConceptExplainer trigger="What is Supabase?">
              Supabase is an open-source Postgres database platform. HQ uses it to store your
              agents, tasks, knowledge, and all workspace data. You create a free project on{" "}
              <span className="font-medium text-foreground">supabase.com</span> and keep full
              control of your data.
            </ConceptExplainer>

            <div className="rounded-xl border border-border/60 bg-card/20 p-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="sb-url" className="text-[12px] font-medium text-foreground">
                  Supabase URL
                </label>
                <input
                  id="sb-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://abcdefghij.supabase.co"
                  className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="sb-anon" className="text-[12px] font-medium text-foreground">
                  Anon key
                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground/60">(public key from project settings)</span>
                </label>
                <input
                  id="sb-anon"
                  type="password"
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1…"
                  aria-label="Supabase anon key"
                  className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="sb-service" className="text-[12px] font-medium text-foreground">
                  Service role key
                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground/60">(admin key — keep this private)</span>
                </label>
                <input
                  id="sb-service"
                  type="password"
                  value={serviceRoleKey}
                  onChange={(e) => setServiceRoleKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1…"
                  aria-label="Supabase service role key"
                  className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                />
              </div>
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
              <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-4 animate-in fade-in duration-200">
                <ol className="list-decimal space-y-2 pl-4 text-[12px] text-muted-foreground">
                  <li>
                    Go to{" "}
                    <a
                      href="https://supabase.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                    >
                      supabase.com
                    </a>{" "}
                    and create a free account
                  </li>
                  <li>Create a new project (any region, free tier is fine)</li>
                  <li>Copy your Project URL + API keys from Settings → Data API</li>
                </ol>
              </div>
            )}

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

      {/* ── Section B: Gateway (progressive disclosure — only visible after DB connects) ── */}
      {dbReady && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-400">
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-300",
              gwReady
                ? "bg-green-500 text-white"
                : "bg-foreground text-background",
            )}>
              {gwReady ? <Check className="h-3 w-3" strokeWidth={3} /> : "2"}
            </div>
            <h2 className="text-[15px] font-semibold">Gateway</h2>
          </div>

          {gwReady ? (
            <div className="rounded-xl border border-green-500/20 bg-green-500/[0.04] px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] text-green-600">
                <Check className="h-3.5 w-3.5" />
                Gateway connected
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <ConceptExplainer trigger="What is a gateway?">
                The gateway is the computer where your AI agents actually run. It connects
                to your database, manages agent workspaces, and handles browser automation.
                You can run it on this machine via Docker or on any remote Linux server.
              </ConceptExplainer>

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
                  <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Requires Docker
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
                  <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Any Linux server
                  </span>
                </button>
              </div>

              {(status.gateway === "starting" || status.gateway === "polling") && (
                <GatewayPollingMessage status={status.gateway} />
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
                    <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                      <p className="mb-2 text-[12px] text-muted-foreground">
                        Run this command from the directory where you installed HQ:
                      </p>
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
                        <code className="text-[13px] font-mono text-foreground">{status.gatewayManualCmd}</code>
                        <CopyButton text={status.gatewayManualCmd} />
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground/60">
                        Once the gateway starts it will register automatically and this page will update.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
              : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
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
