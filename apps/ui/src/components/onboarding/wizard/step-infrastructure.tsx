"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowRight, Check, Loader2, AlertCircle, ExternalLink, Copy, CheckCheck, ChevronDown, Database, Server } from "lucide-react";
import { cn } from "@/lib/utils";

type GatewayPlacement = "local" | "remote";

export interface InfraStatus {
  db: "idle" | "validating" | "schema-needed" | "connected" | "error";
  dbError?: string | null;
  gateway: "idle" | "starting" | "polling" | "connected" | "error";
  gatewayError?: string | null;
  gatewayManualCmd?: string;
  gatewayOneLiner?: string;
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
      {copied ? <CheckCheck className="h-3.5 w-3.5 text-status-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function SetupGuide({ onDone }: { onDone: () => void }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-4 md:p-5 space-y-4">
      <div className="space-y-1">
        <p className="text-[13px] font-medium text-foreground">New to Supabase? Follow these steps</p>
        <p className="text-[12px] text-muted-foreground">
          Supabase is a free, open-source database that stores all your workspace data. You keep full control.
        </p>
      </div>

      <ol className="space-y-3">
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] text-[11px] font-semibold text-foreground/70">1</span>
          <div className="text-[12px] md:text-[13px] text-muted-foreground pt-0.5">
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              Sign up at supabase.com
            </a>
            {" "}— it&apos;s free, no credit card required
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] text-[11px] font-semibold text-foreground/70">2</span>
          <div className="text-[12px] md:text-[13px] text-muted-foreground pt-0.5">
            Create a <span className="font-medium text-foreground/80">new project</span> — any name, any region, free tier works
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] text-[11px] font-semibold text-foreground/70">3</span>
          <div className="text-[12px] md:text-[13px] text-muted-foreground pt-0.5">
            Go to{" "}
            <a
              href="https://supabase.com/dashboard/project/_/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              Settings → API Keys
              <ExternalLink className="ml-0.5 inline h-3 w-3" />
            </a>
            {" "}and copy all three values below
          </div>
        </li>
      </ol>

      <button
        type="button"
        onClick={onDone}
        className="text-[12px] font-medium text-primary hover:text-primary/80 transition-colors"
      >
        I have my project ready →
      </button>
    </div>
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
    <div className="mt-3 space-y-4 rounded-xl border border-status-warning/30 bg-status-warning/[0.04] px-4 py-4">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
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
                  className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] outline-none transition-colors focus:border-primary/40 focus:ring-1 focus:ring-primary/10 disabled:opacity-50"
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
                  className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/10 disabled:opacity-50"
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

  const steps = [
    { label: "Starting containers", threshold: 0 },
    { label: "Connecting to your database", threshold: 10 },
    { label: "Registering gateway", threshold: 20 },
  ];
  const slow = elapsed >= 40;

  return (
    <div className="rounded-xl border border-border/40 bg-card/20 p-4 space-y-3">
      <div className="space-y-2">
        {steps.map((step, i) => {
          const active = elapsed >= step.threshold && (i === steps.length - 1 || elapsed < steps[i + 1].threshold);
          const done = i < steps.length - 1 && elapsed >= steps[i + 1].threshold;
          return (
            <div key={step.label} className="flex items-center gap-2.5">
              {done ? (
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-status-success">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                </div>
              ) : active ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <div className="h-4 w-4 rounded-full border border-border/60" />
              )}
              <span className={cn(
                "text-[12px] transition-colors",
                done ? "text-muted-foreground/50" : active ? "text-foreground font-medium" : "text-muted-foreground/40",
              )}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      {slow && (
        <p className="text-[11px] text-status-warning animate-in fade-in duration-300">
          Taking longer than usual — make sure Docker is running and try the command below if needed.
        </p>
      )}
    </div>
  );
}

function extractProjectRef(supabaseUrl: string): string | null {
  const trimmed = supabaseUrl.trim();
  if (!trimmed) return null;
  const normalized = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(normalized).hostname;
    const parts = host.split(".");
    if (parts.length >= 3 && parts[1] === "supabase" && parts[2] === "co") {
      const ref = parts[0];
      if (ref && ref.length >= 1) return ref;
    }
  } catch { /* invalid URL */ }
  return null;
}

function apiKeysUrl(projectRef: string | null): string {
  if (projectRef) return `https://supabase.com/dashboard/project/${projectRef}/settings/api-keys`;
  return "https://supabase.com/dashboard/project/_/settings/api-keys";
}

function FieldHint({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
    >
      {children}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
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
  const [guideCollapsed, setGuideCollapsed] = useState(false);

  const projectRef = extractProjectRef(url);
  const keysHref = apiKeysUrl(projectRef);

  const dbReady = status.db === "connected";
  const gwReady = status.gateway === "connected";
  const canContinue = dbReady && gwReady;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Infrastructure
        </div>
        <h1 className="text-[24px] md:text-[28px] font-semibold leading-[1.15] tracking-tight">
          {dbReady ? "Connect your gateway" : "Connect your infrastructure"}
        </h1>
        <p className="max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
          {dbReady ? (
            "Your database is connected. Now set up the gateway — the process that runs your AI agents."
          ) : (
            <>
              HQ uses{" "}
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground/80 underline decoration-border underline-offset-2 hover:decoration-foreground/40"
              >
                Supabase
              </a>
              {" "}(a free, open-source database) to store your workspace data.
              You own everything — nothing leaves your project.
            </>
          )}
        </p>
      </div>

      {/* ── Section A: Database ── */}
      <div className="space-y-5">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-300",
            dbReady
              ? "bg-status-success text-primary-foreground"
              : "bg-foreground text-background",
          )}>
            {dbReady ? <Check className="h-3 w-3" strokeWidth={3} /> : <Database className="h-3 w-3" />}
          </div>
          <h2 className="text-[15px] font-semibold">Database</h2>
          {dbReady && (
            <span className="rounded-full bg-status-success/10 px-2 py-0.5 text-[11px] font-medium text-status-success">
              Connected
            </span>
          )}
        </div>

        {dbReady ? (
          <div className="rounded-xl border border-status-success/20 bg-status-success/[0.04] px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-status-success">
              <Check className="h-3.5 w-3.5" />
              Connected to Supabase
            </div>
            {url && (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{url}</p>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Setup guide — shown by default, collapsible */}
            {!guideCollapsed && (
              <SetupGuide onDone={() => setGuideCollapsed(true)} />
            )}

            {guideCollapsed && (
              <button
                type="button"
                onClick={() => setGuideCollapsed(false)}
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                <ChevronDown className="h-3 w-3" />
                Show setup guide
              </button>
            )}

            {/* Credentials form */}
            <div className="rounded-xl border border-border/60 bg-card/20 p-4 md:p-5 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="sb-url" className="text-[12px] font-medium text-foreground">
                    Project URL
                  </label>
                  <FieldHint href="https://supabase.com/dashboard/project/_/settings/api-keys">
                    Where is this?
                  </FieldHint>
                </div>
                <input
                  id="sb-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://abcdefghij.supabase.co"
                  className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
                />
                {projectRef && (
                  <p className="text-[11px] text-muted-foreground/50">
                    Project detected:{" "}
                    <span className="font-mono text-foreground/60">{projectRef}</span>
                  </p>
                )}
              </div>

              {/* Show direct link to user's API Keys page once we have a project ref */}
              {projectRef && !anonKey && !serviceRoleKey && (
                <a
                  href={keysHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3.5 py-2.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/[0.08]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open your API Keys page to copy the values below
                </a>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="sb-publishable" className="text-[12px] font-medium text-foreground">
                    Publishable key
                  </label>
                  <FieldHint href={keysHref}>
                    Where is this?
                  </FieldHint>
                </div>
                <input
                  id="sb-publishable"
                  type="password"
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  placeholder="sb_publishable_… or eyJhbGciOiJIUzI1…"
                  aria-label="Supabase publishable key"
                  className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
                />
                <p className="text-[11px] text-muted-foreground/50">
                  Safe to use in browsers. Previously called &ldquo;anon key&rdquo;.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="sb-secret" className="text-[12px] font-medium text-foreground">
                    Secret key
                  </label>
                  <FieldHint href={keysHref}>
                    Where is this?
                  </FieldHint>
                </div>
                <input
                  id="sb-secret"
                  type="password"
                  value={serviceRoleKey}
                  onChange={(e) => setServiceRoleKey(e.target.value)}
                  placeholder="sb_secret_… or eyJhbGciOiJIUzI1…"
                  aria-label="Supabase secret key"
                  className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
                />
                <p className="text-[11px] text-muted-foreground/50">
                  Admin-level access — keep this private. Previously called &ldquo;service role key&rdquo;.
                </p>
              </div>
            </div>

            {status.db === "error" && status.dbError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{status.dbError}</span>
              </div>
            )}

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
                "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
                status.db === "validating"
                  ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                  : !url.trim() || !anonKey.trim() || !serviceRoleKey.trim()
                    ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                    : "bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.97]",
              )}
            >
              {status.db === "validating" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  Connect database
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>

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
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-400">
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-300",
              gwReady
                ? "bg-status-success text-primary-foreground"
                : "bg-foreground text-background",
            )}>
              {gwReady ? <Check className="h-3 w-3" strokeWidth={3} /> : <Server className="h-3 w-3" />}
            </div>
            <h2 className="text-[15px] font-semibold">Gateway</h2>
            {gwReady && (
              <span className="rounded-full bg-status-success/10 px-2 py-0.5 text-[11px] font-medium text-status-success">
                Connected
              </span>
            )}
          </div>

          <p className="text-[13px] text-muted-foreground max-w-[52ch]">
            The gateway is a lightweight process that runs your AI agents. It connects to your database and handles everything from task execution to browser automation.
          </p>

          {gwReady ? (
            <div className="rounded-xl border border-status-success/20 bg-status-success/[0.04] px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] text-status-success">
                <Check className="h-3.5 w-3.5" />
                Gateway connected
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Placement selection cards */}
              <div role="radiogroup" aria-label="Gateway placement" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={placement === "local"}
                  onClick={() => setPlacement("local")}
                  disabled={status.gateway === "starting" || status.gateway === "polling"}
                  className={cn(
                    "flex flex-col gap-2.5 rounded-xl border p-4 text-left transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    placement === "local"
                      ? "border-primary/50 bg-primary/[0.04] ring-1 ring-primary/10"
                      : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                    (status.gateway === "starting" || status.gateway === "polling") && placement !== "local" && "opacity-40 pointer-events-none",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[18px]">💻</span>
                    <span className="text-[13px] font-medium">This machine</span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-muted-foreground/70">
                    Runs via Docker on your computer. Best for trying things out and local development.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Docker required
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">~2 min setup</span>
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={placement === "remote"}
                  onClick={() => setPlacement("remote")}
                  disabled={status.gateway === "starting" || status.gateway === "polling"}
                  className={cn(
                    "flex flex-col gap-2.5 rounded-xl border p-4 text-left transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    placement === "remote"
                      ? "border-primary/50 bg-primary/[0.04] ring-1 ring-primary/10"
                      : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                    (status.gateway === "starting" || status.gateway === "polling") && placement !== "remote" && "opacity-40 pointer-events-none",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[18px]">☁️</span>
                    <span className="text-[13px] font-medium">Remote server</span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-muted-foreground/70">
                    Deploy on any Linux server or VPS for always-on agents that run 24/7.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Any Linux server
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">~5 min setup</span>
                  </div>
                </button>
              </div>

              {/* Local: show command preview + start button before triggering */}
              {placement === "local" && status.gateway === "idle" && (
                <div className="rounded-xl border border-border/40 bg-card/20 p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="space-y-1">
                    <p className="text-[12px] font-medium text-foreground">
                      We&apos;ll start the gateway via Docker
                    </p>
                    <p className="text-[11px] text-muted-foreground/60">
                      Make sure Docker Desktop is running. This command starts the gateway containers:
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
                    <code className="min-w-0 truncate text-[12px] md:text-[13px] font-mono text-foreground">
                      docker compose --profile gateway up -d
                    </code>
                    <CopyButton text="docker compose --profile gateway up -d" />
                  </div>
                  <button
                    type="button"
                    onClick={() => onChooseGateway("local")}
                    className="group inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2"
                  >
                    Start gateway
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              )}

              {/* Remote: pre-trigger — explain what happens, generate command */}
              {placement === "remote" && status.gateway === "idle" && (
                <div className="rounded-xl border border-border/40 bg-card/20 p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="space-y-1">
                    <p className="text-[12px] font-medium text-foreground">
                      Install the gateway on your server
                    </p>
                    <p className="text-[11px] text-muted-foreground/60">
                      We&apos;ll generate a one-time install command with your Supabase credentials
                      baked in. You&apos;ll run it on your server via SSH.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onChooseGateway("remote")}
                    className="group inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2"
                  >
                    Generate install command
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
              )}

              {/* Remote: post-trigger — show the personalized one-liner */}
              {status.gatewayOneLiner && status.gateway !== "idle" && status.gateway !== "error" && (
                <div className="rounded-xl border border-border/40 bg-card/20 p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="space-y-1">
                    <p className="text-[12px] font-medium text-foreground">
                      Run this on your server
                    </p>
                    <p className="text-[11px] text-muted-foreground/60">
                      SSH into your Linux server and paste this command. It includes your
                      Supabase credentials and a one-time registration token (expires in 15 min).
                    </p>
                  </div>
                  <div className="relative rounded-lg border border-border/40 bg-muted/30">
                    <div className="absolute right-2 top-2">
                      <CopyButton text={status.gatewayOneLiner} />
                    </div>
                    <pre className="overflow-x-auto px-3 py-3 pr-10 text-[11px] leading-relaxed font-mono text-foreground whitespace-pre-wrap break-all">
                      {status.gatewayOneLiner}
                    </pre>
                  </div>
                  <p className="text-[11px] text-muted-foreground/50">
                    This page updates automatically once the gateway connects.
                  </p>
                </div>
              )}

              {/* Polling progress */}
              {(status.gateway === "starting" || status.gateway === "polling") && (
                <GatewayPollingMessage status={status.gateway} />
              )}

              {/* Error state */}
              {status.gateway === "error" && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {status.gatewayError && (
                    <div className="flex items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning/[0.04] px-3 py-2.5 text-[12px] text-foreground">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
                      <div className="space-y-0.5">
                        <span>{status.gatewayError}</span>
                        <p className="text-[11px] text-muted-foreground">
                          {placement === "local"
                            ? "Make sure Docker Desktop is running, then try the command below."
                            : "Check that your server is accessible and Docker is installed."}
                        </p>
                      </div>
                    </div>
                  )}
                  {status.gatewayManualCmd && (
                    <div className="rounded-xl border border-border/40 bg-card/20 p-4 space-y-3">
                      <p className="text-[12px] font-medium text-foreground">
                        Try running manually
                      </p>
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2.5">
                        <code className="min-w-0 truncate text-[12px] md:text-[13px] font-mono text-foreground">{status.gatewayManualCmd}</code>
                        <CopyButton text={status.gatewayManualCmd} />
                      </div>
                      <p className="text-[11px] text-muted-foreground/50">
                        This page updates automatically once the gateway connects.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Continue — only appears once both DB and gateway are connected */}
      {canContinue && (
        <div className="pt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <button
            type="button"
            onClick={onContinue}
            disabled={pending}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
              pending
                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                : "bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.97]",
            )}
          >
            {pending ? "Saving…" : "Continue"}
            {!pending && (
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
