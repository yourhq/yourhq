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
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  validateProjectUrl,
  validateSupabaseCredsAction,
  prepareSchemaInstallAction,
  confirmSchemaInstalledAction,
  saveProjectAction,
  runOneClickMigrationAction,
} from "@/app/onboarding/actions";

export interface StepSupabaseProps {
  defaults: {
    workspaceLabel: string;
    workspaceEmoji: string;
    authEmail: string;
  };
  existing?: {
    url: string;
    projectId: string;
    workspaceLabel: string;
    workspaceEmoji: string;
  } | null;
  onContinueExisting?: () => void;
  onResetCredentials?: () => void;
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
  isCloudHosted: boolean;
}

type StepStatus = "idle" | "running" | "ok" | "error" | "skipped" | "awaiting";
interface SubStepState {
  status: StepStatus;
  error?: string;
  hint?: string;
  sqlFallback?: string;
  collisionTables?: string[];
  install?: {
    sql: string;
    sqlEditorUrl: string;
    projectRef: string | null;
  };
  oneClick?: boolean;
}
const INITIAL: SubStepState = { status: "idle" };

export function StepSupabase({
  defaults,
  existing,
  onContinueExisting,
  onResetCredentials,
  onComplete,
}: StepSupabaseProps) {
  const [editing, setEditing] = useState(false);
  const inSummary = existing != null && !editing;

  const [phase, setPhase] = useState<Phase>("brief");

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
  const [dbPassword, setDbPassword] = useState("");
  const [dbRegion, setDbRegion] = useState("");
  const [keysError, setKeysError] = useState<string | null>(null);
  const [forceInstall, setForceInstall] = useState(false);

  // Provision phase
  const [validate, setValidate] = useState<SubStepState>(INITIAL);
  const [install, setInstall] = useState<SubStepState>(INITIAL);
  const [save, setSave] = useState<SubStepState>(INITIAL);
  const [copied, setCopied] = useState(false);

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

  const runOneClickInstall = useCallback(async (): Promise<boolean> => {
    setInstall({ status: "running", oneClick: true });
    const r = await runOneClickMigrationAction({
      projectRef: resolved?.projectRef ?? "",
      region: dbRegion,
      dbPassword: dbPassword.trim(),
    });
    if (!r.ok) {
      setInstall({
        status: "error",
        error: r.error ?? "Migration failed.",
        hint: r.hint,
        oneClick: true,
      });
      return false;
    }
    setInstall({ status: "ok", oneClick: true });
    return true;
  }, [resolved, dbRegion, dbPassword]);

  const confirmInstall = useCallback(async (): Promise<boolean> => {
    setInstall((prev) => ({ ...prev, status: "running" }));
    const r = await confirmSchemaInstalledAction(creds);
    if (!r.ok) {
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

  // User-triggered one-click: run migrations then auto-advance to save.
  const handleOneClickInstall = useCallback(async () => {
    const ok = await runOneClickInstall();
    if (ok) {
      await runSave();
    }
  }, [runOneClickInstall, runSave]);

  // User-triggered fallback: switch from one-click awaiting to manual flow.
  const handleSwitchToManual = useCallback(async () => {
    await prepareInstall();
  }, [prepareInstall]);

  const runAll = useCallback(async () => {
    const v = await runValidate();
    if (v === "fail") return;
    if (v === "ok") {
      setInstall({ status: "skipped" });
      await runSave();
      return;
    }
    // Schema missing — present the right install panel and wait for
    // the user to explicitly trigger it.
    if (dbPassword.trim() && dbRegion) {
      setInstall({ status: "awaiting", oneClick: true });
      return;
    }
    await prepareInstall();
  }, [runValidate, prepareInstall, runSave, dbPassword, dbRegion]);

  const installAnyway = useCallback(async () => {
    setForceInstall(true);
    setValidate({ status: "ok" });
    if (dbPassword.trim() && dbRegion) {
      setInstall({ status: "awaiting", oneClick: true });
      return;
    }
    await prepareInstall();
  }, [prepareInstall, dbPassword, dbRegion]);

  const handleConfirmInstall = useCallback(async () => {
    const ok = await confirmInstall();
    if (ok) await runSave();
  }, [confirmInstall, runSave]);

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

  // ── Summary card ────────────────────────────────────────────────────

  if (inSummary && existing) {
    return (
      <SummaryView
        url={existing.url}
        workspaceLabel={existing.workspaceLabel}
        workspaceEmoji={existing.workspaceEmoji}
        onContinue={() => onContinueExisting?.()}
        onEdit={() => {
          onResetCredentials?.();
          setEditing(true);
        }}
      />
    );
  }

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
            isCloudHosted: r.isCloudHosted ?? false,
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
        dbPassword={dbPassword}
        dbRegion={dbRegion}
        isCloudHosted={resolved.isCloudHosted}
        error={keysError}
        onBack={() => setPhase("url")}
        onChange={(patch) => {
          if (patch.anonKey !== undefined) setAnonKey(patch.anonKey);
          if (patch.serviceRoleKey !== undefined)
            setServiceRoleKey(patch.serviceRoleKey);
          if (patch.dbPassword !== undefined) setDbPassword(patch.dbPassword);
          if (patch.dbRegion !== undefined) setDbRegion(patch.dbRegion);
        }}
        onSubmit={() => {
          if (!anonKey.trim() || !serviceRoleKey.trim()) {
            setKeysError("Both keys are required.");
            return;
          }
          setKeysError(null);
          setForceInstall(false);
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
        <p className="max-w-[48ch] text-[14px] leading-relaxed text-muted-foreground">
          {install.status === "awaiting" && install.oneClick
            ? "We've verified your connection. When you're ready, click below to create HQ's tables in your database."
            : install.status === "awaiting" && install.install
              ? "We need to create HQ's tables in your database. Follow the steps below to run the migration."
              : "Connecting to your Supabase project and preparing your workspace."}
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-2">
        <SubStepRow
          label="Connect to Supabase"
          desc={`Checking that your project URL and API keys can reach ${resolved?.projectRef ?? "your project"}.`}
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
          desc={
            install.oneClick
              ? "Create tables, functions, and policies in your database via direct Postgres connection."
              : "Create tables, functions, and policies by running the migration SQL in your Supabase SQL editor."
          }
          state={install}
          onRetry={install.oneClick ? () => setInstall({ status: "awaiting", oneClick: true }) : prepareInstall}
          oneClickInstall={
            install.oneClick && install.status === "awaiting"
              ? {
                  onInstall: handleOneClickInstall,
                  onSwitchToManual: handleSwitchToManual,
                }
              : undefined
          }
          oneClickRunning={install.oneClick && install.status === "running"}
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
                  hasAttempted: Boolean(install.error),
                }
              : undefined
          }
        />
        <SubStepRow
          label="Save workspace"
          desc="Save your project URL and keys to this machine so HQ can reconnect on restart."
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
  dbPassword,
  dbRegion,
  isCloudHosted,
  error,
  onBack,
  onChange,
  onSubmit,
}: {
  projectRef?: string;
  apiKeysUrl: string | null;
  anonKey: string;
  serviceRoleKey: string;
  dbPassword: string;
  dbRegion: string;
  isCloudHosted: boolean;
  error: string | null;
  onBack: () => void;
  onChange: (patch: {
    anonKey?: string;
    serviceRoleKey?: string;
    dbPassword?: string;
    dbRegion?: string;
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

        <div className="space-y-4 border-t border-border/40 pt-5">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[12px] font-medium text-muted-foreground">
              One-click schema install
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground/50">
              optional
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/60">
            {isCloudHosted
              ? "Provide your database password and region to let HQ install the schema automatically. Without these, you'll paste SQL into the Supabase editor manually."
              : "Provide your database password and region to let HQ install the schema automatically via the session pooler."}
          </p>

          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground/70">
                Region
              </label>
              <select
                value={dbRegion}
                onChange={(e) => onChange({ dbRegion: e.target.value })}
                className={cn(
                  "w-full rounded-md border border-border/60 bg-transparent px-2.5 py-2 text-[12px] outline-none transition-colors focus:border-foreground",
                  !dbRegion && "text-muted-foreground/30",
                )}
              >
                <option value="">Select region…</option>
                <optgroup label="North America">
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-east-2">US East (Ohio)</option>
                  <option value="us-west-1">US West (N. California)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="ca-central-1">Canada (Central)</option>
                </optgroup>
                <optgroup label="Europe">
                  <option value="eu-west-1">West EU (Ireland)</option>
                  <option value="eu-west-2">West EU (London)</option>
                  <option value="eu-west-3">West EU (Paris)</option>
                  <option value="eu-central-1">Central EU (Frankfurt)</option>
                  <option value="eu-central-2">Central EU (Zurich)</option>
                  <option value="eu-north-1">North EU (Stockholm)</option>
                </optgroup>
                <optgroup label="Asia Pacific">
                  <option value="ap-south-1">South Asia (Mumbai)</option>
                  <option value="ap-southeast-1">Southeast Asia (Singapore)</option>
                  <option value="ap-northeast-1">Northeast Asia (Tokyo)</option>
                  <option value="ap-northeast-2">Northeast Asia (Seoul)</option>
                  <option value="ap-southeast-2">Oceania (Sydney)</option>
                </optgroup>
                <optgroup label="South America">
                  <option value="sa-east-1">South America (São Paulo)</option>
                </optgroup>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground/70">
                Database password
              </label>
              <input
                type="password"
                value={dbPassword}
                onChange={(e) => onChange({ dbPassword: e.target.value })}
                placeholder="Your project password"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-md border border-border/60 bg-transparent px-2.5 py-2 text-[12px] font-mono outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground"
              />
            </div>
          </div>
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
  oneClickInstall,
  oneClickRunning,
  manualInstall,
  collisionAction,
}: {
  label: string;
  desc: string;
  state: SubStepState;
  onRetry?: () => void;
  oneClickInstall?: {
    onInstall: () => void;
    onSwitchToManual: () => void;
  };
  oneClickRunning?: boolean;
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

          {/* One-click install: awaiting user action */}
          {state.status === "awaiting" && oneClickInstall && (
            <OneClickInstallPanel {...oneClickInstall} />
          )}

          {/* One-click install: running */}
          {oneClickRunning && (
            <div className="mt-2 space-y-2 rounded-md border border-border/60 bg-background/40 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground/70" />
                <span className="text-[12px] font-medium text-foreground/80">
                  Running migrations…
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Connecting to Postgres and applying schema files in order.
                This usually finishes in under 10 seconds.
              </p>
            </div>
          )}

          {/* Manual install panel */}
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

/* -------- One-click install panel (Linear/Notion-inspired) -------- */

function OneClickInstallPanel({
  onInstall,
  onSwitchToManual,
}: {
  onInstall: () => void;
  onSwitchToManual: () => void;
}) {
  return (
    <div className="mt-2 space-y-3 rounded-md border border-border/60 bg-background/40 p-3">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        HQ will connect to your database on port 5432 using the password
        you provided and run ~21 migration files. This creates all the
        tables, RPC functions, and row-level security policies HQ needs.
        Every statement is idempotent — safe to re-run if anything was
        partially installed.
      </p>

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onInstall}
          className="group inline-flex items-center gap-2 rounded-md bg-foreground px-3.5 py-2 text-[12px] font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <Play className="h-3 w-3" />
          Install schema
        </button>
        <button
          type="button"
          onClick={onSwitchToManual}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          I&apos;d rather paste SQL manually
        </button>
      </div>
    </div>
  );
}

/* -------- Manual install panel -------- */

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
      <div className="space-y-1.5">
        <p className="text-[12px] font-medium text-foreground">
          Three steps:
        </p>
        <ol className="space-y-1 pl-4 text-[12px] leading-relaxed text-muted-foreground [counter-reset:steps] [&>li]:before:mr-1.5 [&>li]:before:font-medium [&>li]:before:text-foreground/70 [&>li]:before:content-[counter(steps)'.'] [&>li]:[counter-increment:steps]">
          <li>
            <span className="font-medium text-foreground">Copy SQL</span> —
            puts the migration on your clipboard.
          </li>
          <li>
            <span className="font-medium text-foreground">Open SQL editor</span>{" "}
            — opens a new tab in your Supabase project. Paste, then click{" "}
            <span className="font-medium text-foreground">Run</span>.
          </li>
          <li>
            Come back here and click{" "}
            <span className="font-medium text-foreground">I ran it</span>.
          </li>
        </ol>
        <p className="text-[11px] text-muted-foreground/70">
          The migration is safe to re-run — every statement uses{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
            IF NOT EXISTS
          </code>
          , so nothing breaks if some tables already exist.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
            copied
              ? "bg-emerald-500/15 text-emerald-200"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-3 w-3" />
              Copied — now open the SQL editor
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy SQL (~105 KB)
            </>
          )}
        </button>
        <a
          href={sqlEditorUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-[11px] hover:bg-accent/60"
        >
          <ExternalLink className="h-3 w-3" />
          Open SQL editor
        </a>
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

/* -------- Summary view (revisiting after already connected) -------- */

function SummaryView({
  url,
  workspaceLabel,
  workspaceEmoji,
  onContinue,
  onEdit,
}: {
  url: string;
  workspaceLabel: string;
  workspaceEmoji: string;
  onContinue: () => void;
  onEdit: () => void;
}) {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {}

  const [confirmingEdit, setConfirmingEdit] = useState(false);

  return (
    <div className="space-y-10 pt-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Database
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          You&apos;re connected.
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          HQ is talking to your Supabase project. You can keep going or
          switch to a different project.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold leading-tight">
                {workspaceEmoji} {workspaceLabel}
              </span>
            </div>
            <div className="truncate font-mono text-[12px] text-muted-foreground">
              {host}
            </div>
          </div>
        </div>
      </div>

      {confirmingEdit ? (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.04] p-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-1">
              <div className="text-[13px] font-medium">
                Connecting a different project will reset later steps.
              </div>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                You&apos;ll be signed out and your gateway will need to be
                reconnected to the new project.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 px-3 py-1.5 text-[12px] font-medium text-amber-200 hover:bg-amber-500/25"
            >
              Yes, connect a different project
            </button>
            <button
              type="button"
              onClick={() => setConfirmingEdit(false)}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onContinue}
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background hover:bg-foreground/90"
          >
            Continue
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmingEdit(true)}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Connect a different project
          </button>
        </div>
      )}
    </div>
  );
}
