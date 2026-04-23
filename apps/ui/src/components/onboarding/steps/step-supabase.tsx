"use client";

import { useState } from "react";
import {
  Database,
  ExternalLink,
  Copy,
  CheckCircle2,
  Loader2,
  AlertCircle,
  SkipForward,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  validateSupabaseCredsAction,
  installSchemaAction,
  createAuthUserAction,
  saveProjectAction,
} from "@/app/onboarding/actions";
import { createBrowserClient } from "@supabase/ssr";

export interface StepSupabaseProps {
  defaults: {
    workspaceLabel: string;
    workspaceEmoji: string;
    authEmail: string;
  };
  // Called once the full Supabase phase is done. The wizard advances to
  // the next step. All the substep state lives locally — the wizard just
  // needs to know "we're done here."
  onComplete: (data: {
    workspaceLabel: string;
    workspaceEmoji: string;
    url: string;
    authEmail?: string;
    projectId: string;
  }) => void;
}

type StepStatus = "idle" | "running" | "ok" | "error" | "skipped";

interface SubStepState {
  status: StepStatus;
  error?: string;
  hint?: string;
  sqlFallback?: string;
  alreadyExists?: boolean;
}

const INITIAL_STATE: SubStepState = { status: "idle" };

export function StepSupabase({ defaults, onComplete }: StepSupabaseProps) {
  const [phase, setPhase] = useState<"create" | "paste" | "provision">("create");

  // Form inputs
  const [workspaceLabel, setWorkspaceLabel] = useState(defaults.workspaceLabel);
  const [workspaceEmoji, setWorkspaceEmoji] = useState(defaults.workspaceEmoji);
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [authEmail, setAuthEmail] = useState(defaults.authEmail);
  const [authPassword, setAuthPassword] = useState("");

  // Per-substep state. Each step reports its own status so a failure in
  // one doesn't undo the others.
  const [validate, setValidate] = useState<SubStepState>(INITIAL_STATE);
  const [install, setInstall] = useState<SubStepState>(INITIAL_STATE);
  const [createUser, setCreateUser] = useState<SubStepState>(INITIAL_STATE);
  const [save, setSave] = useState<SubStepState>(INITIAL_STATE);

  const [copied, setCopied] = useState(false);

  const copySql = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const creds = { url: url.trim(), anonKey: anonKey.trim(), serviceRoleKey: serviceRoleKey.trim() };

  // ─── Step runners ───────────────────────────────────────────────────

  const runValidate = async (): Promise<"ok" | "schemaMissing" | "fail"> => {
    setValidate({ status: "running" });
    const r = await validateSupabaseCredsAction(creds);
    if (!r.ok) {
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

  const runCreate = async (): Promise<boolean> => {
    setCreateUser({ status: "running" });
    const r = await createAuthUserAction({
      ...creds,
      authEmail: authEmail.trim(),
      authPassword,
    });
    if (!r.ok) {
      setCreateUser({
        status: "error",
        error: r.error,
        hint: r.hint,
        alreadyExists: r.alreadyExists,
      });
      return false;
    }
    setCreateUser({ status: "ok" });
    return true;
  };

  const runSave = async (): Promise<boolean> => {
    setSave({ status: "running" });
    const r = await saveProjectAction({
      ...creds,
      workspaceLabel: workspaceLabel.trim() || "My workspace",
      workspaceEmoji,
      authEmail: authEmail.trim() || undefined,
    });
    if (!r.ok || !r.projectId) {
      setSave({ status: "error", error: r.error, hint: r.hint });
      return false;
    }

    // Auto-sign-in so the user never gets kicked to /login at the end of
    // onboarding. We use the freshly-known URL + anonKey + the per-project
    // cookie prefix the server factory + middleware agree on. This drops
    // the session cookies into the browser for project r.projectId.
    //
    // If the user is on the "skipped — account already exists" path their
    // password is still in the form, so this still works. If they cleared
    // it somehow, the dashboard shell's SignInModal will pop naturally.
    if (authPassword) {
      try {
        const cookiePrefix = `hq-${r.projectId.slice(0, 8)}`;
        const client = createBrowserClient(creds.url, creds.anonKey, {
          cookieOptions: { name: cookiePrefix },
        });
        await client.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
      } catch {
        // Sign-in failure here is non-fatal — the SignInModal will pop
        // after onboarding and the user can finish from there.
      }
    }

    setSave({ status: "ok" });
    onComplete({
      workspaceLabel: workspaceLabel.trim(),
      workspaceEmoji,
      url: url.trim(),
      authEmail: authEmail.trim() || undefined,
      projectId: r.projectId,
    });
    return true;
  };

  // ─── Main flow (clicked after "Paste keys" form) ────────────────────

  const runAll = async () => {
    const v = await runValidate();
    if (v === "fail") return;
    if (v === "schemaMissing") {
      const ok = await runInstall();
      if (!ok) return;
    } else {
      setInstall({ status: "skipped" });
    }
    const created = await runCreate();
    if (!created) return; // user can skip + save manually
    await runSave();
  };

  const handleStartProvisioning = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("provision");
    // Kick off immediately once the phase switches.
    await runAll();
  };

  // Skip user creation (already exists → user signs in later)
  const skipCreateAndSave = async () => {
    setCreateUser({ status: "skipped" });
    await runSave();
  };

  // ─── UI ─────────────────────────────────────────────────────────────

  if (phase === "create") {
    return (
      <div className="space-y-6 pt-6">
        <Header subtitle="Create your database" />

        <div className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-4">
          <GuideStep number={1} title="Open Supabase">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Sign in or create a free account.
            </p>
            <a
              href="https://supabase.com/dashboard/projects"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-[12px] font-medium hover:bg-accent/60"
            >
              Open Supabase <ExternalLink className="h-3 w-3" />
            </a>
          </GuideStep>

          <GuideStep number={2} title="Create a new project">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Click <span className="font-semibold">New project</span>, pick any
              name, set a strong database password, choose a region close to
              you. Provisioning takes ~2 minutes.
            </p>
          </GuideStep>

          <GuideStep number={3} title="Copy your keys">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              In <span className="font-medium">Project Settings → API</span>,
              copy these three values:
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
              <li>• Project URL</li>
              <li>• Anon (public) key</li>
              <li>• Service role key</li>
            </ul>
          </GuideStep>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-[11px] text-muted-foreground/70">
            We&apos;ll install the schema + create your account automatically.
          </div>
          <Button onClick={() => setPhase("paste")}>I&apos;ve got my keys →</Button>
        </div>
      </div>
    );
  }

  if (phase === "paste") {
    return (
      <form onSubmit={handleStartProvisioning} className="space-y-5 pt-6">
        <Header subtitle="Connect your Supabase project" />

        <div className="space-y-4 rounded-md border border-border/60 bg-card p-4">
          <div className="grid grid-cols-[64px_1fr] gap-2">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Icon</Label>
              <Input
                value={workspaceEmoji}
                onChange={(e) => setWorkspaceEmoji(e.target.value)}
                maxLength={8}
                className="text-center text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Workspace name</Label>
              <Input
                value={workspaceLabel}
                onChange={(e) => setWorkspaceLabel(e.target.value)}
                maxLength={80}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">Supabase project URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxxxxxxx.supabase.co"
              type="url"
              className="font-mono text-[12px]"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">Anon (public) key</Label>
            <Input
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="sb_publishable_… or eyJ…"
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-[12px]"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">Service role key</Label>
            <Input
              value={serviceRoleKey}
              onChange={(e) => setServiceRoleKey(e.target.value)}
              placeholder="sb_secret_… or eyJ…"
              type="password"
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-[12px]"
              required
            />
            <p className="text-[11px] text-muted-foreground/70">
              Stored on this machine only in /config/secrets.json.
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-md border border-border/60 bg-card p-4">
          <div className="text-[12px] font-medium text-muted-foreground">
            Create your account
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Email</Label>
            <Input
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Password</Label>
            <Input
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              type="password"
              placeholder="At least 6 characters"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <p className="text-[11px] text-muted-foreground/70">
            If this email is already registered in your Supabase project, you
            can skip account creation on the next step.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setPhase("create")}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            ← Back to instructions
          </button>
          <Button type="submit">Connect</Button>
        </div>
      </form>
    );
  }

  // ── Provision phase: stepper with per-step retry/skip ────────────

  const allDone =
    validate.status === "ok" &&
    (install.status === "ok" || install.status === "skipped") &&
    (createUser.status === "ok" || createUser.status === "skipped") &&
    save.status === "ok";

  return (
    <div className="space-y-5 pt-6">
      <Header subtitle="Setting up your workspace" />

      <div className="space-y-2 rounded-lg border border-border/60 bg-card/60 p-2">
        <SubStepRow
          label="Check connection"
          desc="Reach Supabase and verify your keys."
          state={validate}
          onRetry={runAll}
        />
        <SubStepRow
          label="Install schema"
          desc="Create the tables, triggers, and RPCs HQ needs."
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
          label="Create your account"
          desc={`Add ${authEmail || "your email"} to this workspace's Auth users.`}
          state={createUser}
          onRetry={runCreate}
          onSkip={
            createUser.alreadyExists ? skipCreateAndSave : undefined
          }
        />
        <SubStepRow
          label="Save workspace"
          desc="Store creds locally and finish."
          state={save}
          onRetry={runSave}
        />
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setPhase("paste")}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← Edit credentials
        </button>
        {allDone && (
          <div className="text-[12px] text-muted-foreground">
            Done — advancing…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function Header({ subtitle }: { subtitle: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#3ecf8e]/10 text-[#3ecf8e]">
          <Database className="h-3.5 w-3.5" />
        </div>
        <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          Supabase
        </span>
      </div>
      <h1 className="text-[22px] font-semibold tracking-tight">{subtitle}</h1>
    </div>
  );
}

function GuideStep({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
        {number}
      </div>
      <div className="flex-1 space-y-1 pb-2">
        <div className="text-[13px] font-medium">{title}</div>
        {children}
      </div>
    </div>
  );
}

function SubStepRow({
  label,
  desc,
  state,
  onRetry,
  onSkip,
  fallback,
}: {
  label: string;
  desc: string;
  state: SubStepState;
  onRetry?: () => void;
  onSkip?: () => void;
  fallback?: { sql: string; copied: boolean; onCopy: () => void };
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5",
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
            <div className="space-y-1 pt-1 text-[12px]">
              <div className="text-destructive">{state.error}</div>
              {state.hint && (
                <div className="text-muted-foreground text-[11px]">
                  {state.hint}
                </div>
              )}
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
                {onSkip && (
                  <button
                    type="button"
                    onClick={onSkip}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] hover:bg-accent/60"
                  >
                    <SkipForward className="h-3 w-3" />
                    Skip — my account already exists
                  </button>
                )}
              </div>
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
    return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-foreground/70" />;
  if (status === "error")
    return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  if (status === "skipped")
    return (
      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/60">
        <span className="block h-1 w-1 rounded-full bg-muted-foreground/40" />
      </div>
    );
  return (
    <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-border/60" />
  );
}
