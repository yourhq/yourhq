"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  validateProjectUrl,
  validateSupabaseCredsAction,
  prepareSchemaInstallAction,
  confirmSchemaInstalledAction,
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
  projectRef?: string;
  apiKeysUrl: string | null;
}

type StepStatus = "idle" | "running" | "ok" | "error" | "skipped" | "awaiting";
interface SubStepState {
  status: StepStatus;
  error?: string;
  hint?: string;
  sqlFallback?: string;
  collisionTables?: string[];
  // For the install row, we store the prepared SQL + dashboard link so
  // the user can open the SQL editor in a new tab and run the migration.
  install?: {
    sql: string;
    sqlEditorUrl: string;
    projectRef: string | null;
  };
}
const INITIAL: SubStepState = { status: "idle" };

export function StepSupabase({ defaults, onComplete }: StepSupabaseProps) {
  const [phase, setPhase] = useState<Phase>("brief");

  // Workspace identity is captured earlier in the flow (StepWorkspace).
  // We just thread the values through here so they end up in the
  // saveProjectAction call + the onComplete payload.
  const workspaceLabel = defaults.workspaceLabel;
  const workspaceEmoji = defaults.workspaceEmoji;

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

  // ── Provisioning runners — declared up here (before any early return)
  //    so the rules-of-hooks aren't violated. Each one runs an async
  //    action and updates its sub-step's UI status.

  const creds = useMemo(
    () =>
      resolved !== null
        ? {
            url: resolved.url,
            anonKey: anonKey.trim(),
            serviceRoleKey: serviceRoleKey.trim(),
          }
        : { url: "", anonKey: "", serviceRoleKey: "" },
    [resolved, anonKey, serviceRoleKey],
  );

  const copySql = useCallback(async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, []);

  const runValidate = useCallback(async (): Promise<
    "ok" | "schemaMissing" | "fail"
  > => {
    setValidate({ status: "running" });
    const r = await validateSupabaseCredsAction(creds);
    if (!r.ok) {
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
  }, [creds]);

  // Two-step install: prepare loads the SQL + builds a deep-link to the
  // user's SQL editor; awaiting tells the UI to render the "Open editor /
  // I ran it ✓" panel; confirm re-probes the workspace table.
  const prepareInstall = useCallback(async (): Promise<boolean> => {
    setInstall({ status: "running" });
    const r = await prepareSchemaInstallAction(creds);
    if (!r.ok || !r.sql || !r.sqlEditorUrl) {
      setInstall({
        status: "error",
        error: r.error ?? "Couldn't prepare the migration.",
        hint: r.hint,
      });
      return false;
    }
    setInstall({
      status: "awaiting",
      install: {
        sql: r.sql,
        sqlEditorUrl: r.sqlEditorUrl,
        projectRef: r.projectRef ?? null,
      },
    });
    return true;
  }, [creds]);

  const confirmInstall = useCallback(async (): Promise<boolean> => {
    setInstall((prev) => ({ ...prev, status: "running" }));
    const r = await confirmSchemaInstalledAction(creds);
    if (!r.ok) {
      // Keep install payload around so user can retry without re-fetching.
      setInstall((prev) => ({
        ...prev,
        status: "awaiting",
        error: r.error,
        hint: r.hint,
      }));
      return false;
    }
    setInstall({ status: "ok" });
    return true;
  }, [creds]);

  const runSave = useCallback(async (): Promise<boolean> => {
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
  }, [creds, workspaceLabel, workspaceEmoji, onComplete]);

  const runAll = useCallback(async () => {
    const v = await runValidate();
    if (v === "fail") return;
    // Schema already installed → skip straight to save. (Re-running the
    // idempotent migration would be safe but pointless and adds friction.)
    if (v === "ok") {
      setInstall({ status: "skipped" });
      await runSave();
      return;
    }
    // Schema missing → prepare the deep-link, then wait for the user
    // to click "I ran it ✓" before continuing to save.
    await prepareInstall();
  }, [runValidate, prepareInstall, runSave]);

  const installAnyway = useCallback(async () => {
    setForceInstall(true);
    setValidate({ status: "ok" });
    await prepareInstall();
  }, [prepareInstall]);

  // After the user clicks "I ran it ✓" and we successfully verify, kick
  // the save step ourselves — the user shouldn't have to click again.
  const handleConfirmInstall = useCallback(async () => {
    const ok = await confirmInstall();
    if (ok) await runSave();
  }, [confirmInstall, runSave]);

  // Kick off the sequence once when we land on `provision` phase.
  // Deferred via setTimeout(0) so the initial setState calls inside
  // runAll happen *after* this render commits, satisfying the
  // react-hooks/set-state-in-effect rule.
  const startedRef = useRef(false);
  useEffect(() => {
    if (phase !== "provision") {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    const t = setTimeout(() => {
      void runAll();
    }, 0);
    return () => clearTimeout(t);
  }, [phase, runAll]);

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
          {/* Both tiles auto-advance to the URL phase. The "create" tile
              also opens supabase.com in a new tab — the user comes back
              to find us already on the next screen, ready to paste. */}
          <a
            href="https://supabase.com/dashboard/projects"
            target="_blank"
            rel="noreferrer"
            onClick={() => setPhase("url")}
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
                Free, no credit card. Takes ~2 minutes to provision.
                We&apos;ll be ready to receive your URL when you come back.
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
            projectRef: r.ref,
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
        projectRef={resolved.projectRef}
        apiKeysUrl={resolved.apiKeysUrl}
        anonKey={anonKey}
        serviceRoleKey={serviceRoleKey}
        error={keysError}
        onBack={() => setPhase("url")}
        onChange={(patch) => {
          if (patch.anonKey !== undefined) setAnonKey(patch.anonKey);
          if (patch.serviceRoleKey !== undefined)
            setServiceRoleKey(patch.serviceRoleKey);
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
          desc="Run the migration in your Supabase SQL editor."
          state={install}
          // If we hit a hard error (not awaiting), `prepareInstall`
          // re-fetches the SQL + deep-link. Awaiting state has its own
          // "I ran it / Check again" button inside the panel.
          onRetry={prepareInstall}
          manualInstall={
            install.install
              ? {
                  sqlEditorUrl: install.install.sqlEditorUrl,
                  sql: install.install.sql,
                  copied,
                  onCopy: () => copySql(install.install!.sql),
                  onConfirm: handleConfirmInstall,
                  isVerifying: install.status === "running",
                  verifyError:
                    install.status === "awaiting" ? install.error : undefined,
                  verifyHint:
                    install.status === "awaiting" ? install.hint : undefined,
                  // Once we've tried verifying at least once, the button
                  // becomes "Check again" rather than "I ran it".
                  hasAttempted: Boolean(install.error),
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
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
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
          ref={inputRef}
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
  projectRef,
  apiKeysUrl,
  anonKey,
  serviceRoleKey,
  error,
  onBack,
  onChange,
  onSubmit,
}: {
  projectRef?: string;
  apiKeysUrl: string | null;
  anonKey: string;
  serviceRoleKey: string;
  error: string | null;
  onBack: () => void;
  onChange: (patch: {
    anonKey?: string;
    serviceRoleKey?: string;
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
              Open API keys for {projectRef}
            </div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              supabase.com/dashboard/project/{projectRef}/settings/api-keys
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
            Publishable key
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
            Starts with <span className="font-mono">sb_publishable_</span>. Lets HQ talk to your database.
          </p>
        </div>

        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Secret key
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
            Starts with <span className="font-mono">sb_secret_</span>. Lets HQ install the schema. Never leaves this machine.
          </p>
        </div>
      </div>

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
  manualInstall,
  collisionAction,
}: {
  label: string;
  desc: string;
  state: SubStepState;
  onRetry?: () => void;
  manualInstall?: {
    sqlEditorUrl: string;
    sql: string;
    copied: boolean;
    onCopy: () => void;
    onConfirm: () => void;
    isVerifying: boolean;
    verifyError?: string;
    verifyHint?: string;
    hasAttempted?: boolean;
  };
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
            : state.status === "running" || state.status === "awaiting"
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
              <span className="text-[10px] text-muted-foreground">already installed</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{desc}</p>

          {state.status === "awaiting" && manualInstall && (
            <ManualInstallPanel {...manualInstall} />
          )}

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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ManualInstallPanel({
  sqlEditorUrl,
  copied,
  onCopy,
  onConfirm,
  isVerifying,
  verifyError,
  verifyHint,
  hasAttempted,
}: {
  sqlEditorUrl: string;
  sql: string;
  copied: boolean;
  onCopy: () => void;
  onConfirm: () => void;
  isVerifying: boolean;
  verifyError?: string;
  verifyHint?: string;
  hasAttempted?: boolean;
}) {
  return (
    <div className="mt-2 space-y-3 rounded-md border border-border/60 bg-background/40 p-3">
      <div className="space-y-1">
        <p className="text-[12px] leading-relaxed">
          Open your project&apos;s SQL editor in a new tab — the migration is
          pre-loaded. Click <span className="font-medium">Run</span> in the
          editor, then come back here.
        </p>
        <p className="text-[11px] text-muted-foreground">
          The migration is idempotent — safe to run on a new or existing project.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={sqlEditorUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background hover:bg-foreground/90"
        >
          <ExternalLink className="h-3 w-3" />
          Open SQL editor
        </a>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-[11px] hover:bg-accent/60"
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Copied SQL
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy SQL
            </>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-border/40 pt-2.5">
        <button
          type="button"
          onClick={onConfirm}
          disabled={isVerifying}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
            isVerifying
              ? "cursor-wait bg-muted text-muted-foreground"
              : "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25",
          )}
        >
          {isVerifying ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3 w-3" />
              {hasAttempted ? "Check again" : "I ran it"}
            </>
          )}
        </button>
        <span className="text-[11px] text-muted-foreground">
          We&apos;ll verify the schema landed.
        </span>
      </div>

      {verifyError && (
        <div className="space-y-1 border-t border-destructive/30 pt-2 text-[12px]">
          <div className="text-destructive">{verifyError}</div>
          {verifyHint && (
            <div className="text-[11px] text-muted-foreground">{verifyHint}</div>
          )}
        </div>
      )}
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
  if (status === "awaiting")
    return (
      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500/60">
        <span className="block h-1 w-1 rounded-full bg-amber-500" />
      </div>
    );
  if (status === "skipped")
    return (
      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/60">
        <span className="block h-1 w-1 rounded-full bg-muted-foreground/40" />
      </div>
    );
  return <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-border/60" />;
}
