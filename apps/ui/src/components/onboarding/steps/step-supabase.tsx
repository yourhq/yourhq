"use client";

import { useEffect, useRef, useState } from "react";
import {
  Database,
  ExternalLink,
  Copy,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RotateCcw,
  ArrowRight,
  Globe,
  KeyRound,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  validateProjectUrl,
  validateSupabaseCredsAction,
  installSchemaAction,
  saveProjectAction,
} from "@/app/onboarding/actions";

export interface StepSupabaseProps {
  defaults: {
    workspaceLabel: string;
    workspaceEmoji: string;
    authEmail: string;
  };
  onComplete: (data: {
    workspaceLabel: string;
    workspaceEmoji: string;
    url: string;
    anonKey: string;
    projectId: string;
  }) => void;
}

type Phase = "brief" | "url" | "keys" | "provision";

interface ResolvedUrl {
  url: string;
  ref?: string;
  apiKeysUrl: string | null;
}

type StepStatus = "idle" | "running" | "ok" | "error" | "skipped";
interface SubStepState {
  status: StepStatus;
  error?: string;
  hint?: string;
  sqlFallback?: string;
  collisionTables?: string[];
}
const INITIAL: SubStepState = { status: "idle" };

export function StepSupabase({ defaults, onComplete }: StepSupabaseProps) {
  const [phase, setPhase] = useState<Phase>("brief");

  // Workspace identity
  const [workspaceLabel, setWorkspaceLabel] = useState(defaults.workspaceLabel);
  const [workspaceEmoji, setWorkspaceEmoji] = useState(defaults.workspaceEmoji);

  // URL phase
  const [urlInput, setUrlInput] = useState("");
  const [resolved, setResolved] = useState<ResolvedUrl | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlPending, setUrlPending] = useState(false);

  // Keys phase
  const [anonKey, setAnonKey] = useState("");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [keysError, setKeysError] = useState<string | null>(null);
  const [forceInstall, setForceInstall] = useState(false);

  // Provision phase
  const [validate, setValidate] = useState<SubStepState>(INITIAL);
  const [install, setInstall] = useState<SubStepState>(INITIAL);
  const [save, setSave] = useState<SubStepState>(INITIAL);
  const [copied, setCopied] = useState(false);

  // ── Phase: brief ────────────────────────────────────────────────────

  if (phase === "brief") {
    return (
      <div className="space-y-10 pt-8">
        <div className="space-y-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            Database
          </div>
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
            Connect your Supabase project.
          </h1>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
            HQ stores everything — contacts, agents, content — in your own
            Supabase. Free for personal use, your data, your control.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
          <a
            href="https://supabase.com/dashboard/projects"
            target="_blank"
            rel="noreferrer"
            className="group relative flex flex-col gap-3 rounded-xl border border-border/60 bg-gradient-to-br from-[#3ecf8e]/[0.06] to-card/40 p-5 text-left transition-all hover:border-[#3ecf8e]/40 hover:from-[#3ecf8e]/[0.1]"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3ecf8e]/15 text-[#3ecf8e]">
                <Database className="h-4 w-4" />
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
            </div>
            <div>
              <div className="text-[14px] font-semibold leading-tight">
                Create a Supabase project
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                Free, no credit card. Takes ~2 minutes to provision. Come
                back here when it&apos;s ready.
              </p>
            </div>
          </a>

          <button
            type="button"
            onClick={() => setPhase("url")}
            className="group relative flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-5 text-left transition-all hover:border-border hover:bg-card/70"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60">
              <KeyRound className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[14px] font-semibold leading-tight">
                I already have a project
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                Skip ahead and paste your project URL.
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setPhase("url")}
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background transition-all hover:bg-foreground/90"
          >
            I&apos;m ready
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: url ──────────────────────────────────────────────────────

  if (phase === "url") {
    return (
      <UrlPhase
        defaultUrl={urlInput}
        pending={urlPending}
        error={urlError}
        onBack={() => setPhase("brief")}
        onSubmit={async (val) => {
          setUrlPending(true);
          setUrlError(null);
          const r = await validateProjectUrl({ url: val });
          setUrlPending(false);
          if (!r.ok || !r.url) {
            setUrlError(r.error ?? "Invalid URL.");
            return;
          }
          setUrlInput(r.url);
          setResolved({
            url: r.url,
            ref: r.ref,
            apiKeysUrl: r.apiKeysUrl ?? null,
          });
          setPhase("keys");
        }}
      />
    );
  }

  // ── Phase: keys ─────────────────────────────────────────────────────

  if (phase === "keys" && resolved) {
    return (
      <KeysPhase
        url={resolved.url}
        ref={resolved.ref}
        apiKeysUrl={resolved.apiKeysUrl}
        anonKey={anonKey}
        serviceRoleKey={serviceRoleKey}
        workspaceLabel={workspaceLabel}
        workspaceEmoji={workspaceEmoji}
        error={keysError}
        onBack={() => setPhase("url")}
        onChange={(patch) => {
          if (patch.anonKey !== undefined) setAnonKey(patch.anonKey);
          if (patch.serviceRoleKey !== undefined)
            setServiceRoleKey(patch.serviceRoleKey);
          if (patch.workspaceLabel !== undefined)
            setWorkspaceLabel(patch.workspaceLabel);
          if (patch.workspaceEmoji !== undefined)
            setWorkspaceEmoji(patch.workspaceEmoji);
        }}
        onSubmit={() => {
          if (!anonKey.trim() || !serviceRoleKey.trim()) {
            setKeysError("Both keys are required.");
            return;
          }
          setKeysError(null);
          setForceInstall(false);
          // Reset substep states for a fresh provision.
          setValidate(INITIAL);
          setInstall(INITIAL);
          setSave(INITIAL);
          setPhase("provision");
        }}
      />
    );
  }

  // ── Phase: provision ────────────────────────────────────────────────

  const creds =
    resolved !== null
      ? {
          url: resolved.url,
          anonKey: anonKey.trim(),
          serviceRoleKey: serviceRoleKey.trim(),
        }
      : { url: "", anonKey: "", serviceRoleKey: "" };

  const copySql = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const runValidate = async (): Promise<"ok" | "schemaMissing" | "fail"> => {
    setValidate({ status: "running" });
    const r = await validateSupabaseCredsAction(creds);
    if (!r.ok) {
      // Collision case — surface conflict details so user can choose path.
      if (r.collisionTables && r.collisionTables.length > 0) {
        setValidate({
          status: "error",
          error: r.error,
          hint: r.hint,
          collisionTables: r.collisionTables,
        });
        return "fail";
      }
      setValidate({ status: "error", error: r.error, hint: r.hint });
      return "fail";
    }
    setValidate({ status: "ok" });
    return r.schemaInstalled ? "ok" : "schemaMissing";
  };

  const runInstall = async (): Promise<boolean> => {
    setInstall({ status: "running" });
    const r = await installSchemaAction(creds);
    if (!r.ok) {
      setInstall({
        status: "error",
        error: r.error,
        hint: r.hint,
        sqlFallback: r.sqlFallback,
      });
      return false;
    }
    setInstall({ status: "ok" });
    return true;
  };

  const runSave = async (): Promise<boolean> => {
    setSave({ status: "running" });
    const r = await saveProjectAction({
      ...creds,
      workspaceLabel: workspaceLabel.trim() || "My workspace",
      workspaceEmoji,
    });
    if (!r.ok || !r.projectId) {
      setSave({ status: "error", error: r.error, hint: r.hint });
      return false;
    }
    setSave({ status: "ok" });
    onComplete({
      workspaceLabel: workspaceLabel.trim(),
      workspaceEmoji,
      url: creds.url,
      anonKey: creds.anonKey,
      projectId: r.projectId,
    });
    return true;
  };

  const runAll = async () => {
    const v = await runValidate();
    if (v === "fail") return;
    if (v === "schemaMissing") {
      const ok = await runInstall();
      if (!ok) return;
    } else {
      setInstall({ status: "skipped" });
    }
    await runSave();
  };

  // Kick the whole sequence on first arrival to provision phase.
  const startedRef = useRef(false);
  useEffect(() => {
    if (phase !== "provision") {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    void runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Power-user override for the conflict case
  const installAnyway = async () => {
    setForceInstall(true);
    setValidate({ status: "ok" });
    const ok = await runInstall();
    if (ok) await runSave();
  };

  return (
    <div className="space-y-8 pt-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Setting up
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Setting up your workspace.
        </h1>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          This usually takes 5–10 seconds.
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-2">
        <SubStepRow
          label="Connect to Supabase"
          desc={`Verify ${resolved?.url ?? ""} and your keys.`}
          state={validate}
          onRetry={runAll}
          collisionAction={
            validate.collisionTables && validate.collisionTables.length > 0 && !forceInstall
              ? {
                  conflictTables: validate.collisionTables,
                  onUseSeparate: () => setPhase("brief"),
                  onInstallAnyway: installAnyway,
                }
              : undefined
          }
        />
        <SubStepRow
          label="Install schema"
          desc="Create the tables and functions HQ needs."
          state={install}
          onRetry={runInstall}
          fallback={
            install.sqlFallback
              ? {
                  sql: install.sqlFallback,
                  copied,
                  onCopy: () => copySql(install.sqlFallback!),
                }
              : undefined
          }
        />
        <SubStepRow
          label="Save workspace"
          desc="Store credentials locally on this machine."
          state={save}
          onRetry={runSave}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => setPhase("keys")}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← Edit credentials
        </button>
      </div>
    </div>
  );
}

/* -------- URL phase -------- */

function UrlPhase({
  defaultUrl,
  pending,
  error,
  onBack,
  onSubmit,
}: {
  defaultUrl: string;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: (url: string) => void;
}) {
  const [val, setVal] = useState(defaultUrl);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (val.trim()) onSubmit(val.trim());
      }}
      className="space-y-10 pt-8"
    >
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Database · Step 1 of 2
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Paste your project URL.
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          Find this on your Supabase project&apos;s home page, or copy it
          straight from the address bar.
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          Project URL
        </label>
        <input
          ref={ref}
          type="url"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="https://xxxxxxxx.supabase.co"
          className="w-full border-0 border-b border-border/60 bg-transparent pb-2 font-mono text-[16px] outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground"
          autoComplete="off"
          spellCheck={false}
          required
        />
        {error && (
          <p className="text-[12px] text-destructive">{error}</p>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!val.trim() || pending}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
            !val.trim() || pending
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {pending ? "Checking…" : "Continue"}
          {!pending && (
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
      </div>
    </form>
  );
}

/* -------- Keys phase -------- */

function KeysPhase({
  url,
  ref,
  apiKeysUrl,
  anonKey,
  serviceRoleKey,
  workspaceLabel,
  workspaceEmoji,
  error,
  onBack,
  onChange,
  onSubmit,
}: {
  url: string;
  ref?: string;
  apiKeysUrl: string | null;
  anonKey: string;
  serviceRoleKey: string;
  workspaceLabel: string;
  workspaceEmoji: string;
  error: string | null;
  onBack: () => void;
  onChange: (patch: {
    anonKey?: string;
    serviceRoleKey?: string;
    workspaceLabel?: string;
    workspaceEmoji?: string;
  }) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-8 pt-8"
    >
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Database · Step 2 of 2
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Now grab your API keys.
        </h1>
        <p className="max-w-[48ch] text-[14px] leading-relaxed text-muted-foreground">
          Open the API keys page in Supabase and copy both values below.
          Both stay on this machine in <span className="font-mono">/config/secrets.json</span>.
        </p>
      </div>

      {apiKeysUrl ? (
        <a
          href={apiKeysUrl}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 rounded-xl border border-border/60 bg-gradient-to-br from-[#3ecf8e]/[0.06] to-card/40 p-4 transition-all hover:border-[#3ecf8e]/40"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3ecf8e]/15 text-[#3ecf8e]">
            <ExternalLink className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">
              Open API keys for {ref}
            </div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              supabase.com/dashboard/project/{ref}/settings/api-keys
            </div>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
        </a>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-[12px] text-muted-foreground">
          Self-hosted Supabase — find your keys in your instance&apos;s
          dashboard under Settings → API.
        </div>
      )}

      <div className="space-y-5">
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" />
            Anon (public) key
          </label>
          <input
            type="text"
            value={anonKey}
            onChange={(e) => onChange({ anonKey: e.target.value })}
            placeholder="sb_publishable_…"
            spellCheck={false}
            autoComplete="off"
            className="w-full border-0 border-b border-border/60 bg-transparent pb-2 font-mono text-[13px] outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground"
            required
          />
          <p className="text-[11px] text-muted-foreground/60">
            Lets HQ talk to your database.
          </p>
        </div>

        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Service role key
          </label>
          <input
            type="password"
            value={serviceRoleKey}
            onChange={(e) => onChange({ serviceRoleKey: e.target.value })}
            placeholder="sb_secret_…"
            spellCheck={false}
            autoComplete="off"
            className="w-full border-0 border-b border-border/60 bg-transparent pb-2 font-mono text-[13px] outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground"
            required
          />
          <p className="text-[11px] text-muted-foreground/60">
            Lets HQ install the schema. Stays on this machine.
          </p>
        </div>
      </div>

      <details className="rounded-xl border border-border/40 bg-card/20 p-3">
        <summary className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground">
          Workspace details (optional)
        </summary>
        <div className="mt-3 grid grid-cols-[64px_1fr] gap-2.5">
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">Icon</label>
            <Input
              value={workspaceEmoji}
              onChange={(e) => onChange({ workspaceEmoji: e.target.value })}
              maxLength={8}
              className="text-center"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground">
              Workspace name
            </label>
            <Input
              value={workspaceLabel}
              onChange={(e) => onChange({ workspaceLabel: e.target.value })}
              maxLength={80}
            />
          </div>
        </div>
      </details>

      {error && (
        <p className="text-[12px] text-destructive">{error}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!anonKey.trim() || !serviceRoleKey.trim()}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
            !anonKey.trim() || !serviceRoleKey.trim()
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          Connect
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
      </div>
    </form>
  );
}

/* -------- Sub-step row -------- */

function SubStepRow({
  label,
  desc,
  state,
  onRetry,
  fallback,
  collisionAction,
}: {
  label: string;
  desc: string;
  state: SubStepState;
  onRetry?: () => void;
  fallback?: { sql: string; copied: boolean; onCopy: () => void };
  collisionAction?: {
    conflictTables: string[];
    onUseSeparate: () => void;
    onInstallAnyway: () => void;
  };
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 transition-colors",
        state.status === "ok"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : state.status === "error"
            ? "border-destructive/40 bg-destructive/5"
            : state.status === "running"
              ? "border-border bg-accent/30"
              : "border-transparent bg-transparent",
      )}
    >
      <div className="flex items-start gap-2.5">
        <StatusIcon status={state.status} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium">{label}</span>
            {state.status === "skipped" && (
              <span className="text-[10px] text-muted-foreground">skipped</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{desc}</p>

          {state.status === "error" && (
            <div className="space-y-1.5 pt-1 text-[12px]">
              <div className="text-destructive">{state.error}</div>
              {state.hint && (
                <div className="text-[11px] text-muted-foreground">
                  {state.hint}
                </div>
              )}

              {collisionAction ? (
                <div className="mt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={collisionAction.onUseSeparate}
                    className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-accent/60"
                  >
                    Use a separate Supabase project
                  </button>
                  <button
                    type="button"
                    onClick={collisionAction.onInstallAnyway}
                    className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    I know what I&apos;m doing — install anyway
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] hover:bg-accent/60"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                </div>
              )}

              {fallback && (
                <div className="mt-2 space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
                  <p className="text-[11px] text-muted-foreground">
                    Copy the SQL and paste it into Supabase&apos;s SQL editor,
                    then click Retry.
                  </p>
                  <button
                    type="button"
                    onClick={fallback.onCopy}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] hover:bg-accent/60"
                  >
                    {fallback.copied ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy SQL
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "ok")
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />;
  if (status === "running")
    return (
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-foreground/70" />
    );
  if (status === "error")
    return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  if (status === "skipped")
    return (
      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/60">
        <span className="block h-1 w-1 rounded-full bg-muted-foreground/40" />
      </div>
    );
  return <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-border/60" />;
}
