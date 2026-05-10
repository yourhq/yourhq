"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, AlertCircle, CreditCard, Pencil, Eye, EyeOff, Copy, CheckCheck, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { StaggeredEntrance } from "@/components/onboarding/wizard/staggered-entrance";
import { WizardProgress } from "@/components/onboarding/wizard/wizard-progress";
import { StepProvisioning } from "@/components/onboarding/wizard/step-provisioning";
import {
  validateNewWorkspaceDb,
  confirmNewWorkspaceSchema,
  createOssWorkspace,
  createHostedWorkspaceCheckout,
} from "@/app/new-workspace/actions";
import { pollProvisionStatus, verifyAutoLogin } from "@/components/onboarding/wizard/hosted-actions";

type Step = "name" | "database" | "account" | "payment" | "provisioning" | "done";

const OSS_STEPS: Step[] = ["name", "database", "account", "done"];
const HOSTED_STEPS: Step[] = ["name", "payment", "provisioning", "done"];

const OSS_PROGRESS = [
  { key: "name", label: "Name" },
  { key: "database", label: "Database" },
  { key: "account", label: "Account" },
  { key: "done", label: "Done" },
];

const HOSTED_PROGRESS = [
  { key: "name", label: "Name" },
  { key: "payment", label: "Payment" },
  { key: "provisioning", label: "Setup" },
  { key: "done", label: "Done" },
];

interface Props {
  isHosted: boolean;
  email?: string;
}

export function NewWorkspaceWizard({ isHosted, email: initialEmail }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const steps = isHosted ? HOSTED_STEPS : OSS_STEPS;
  const progressSteps = isHosted ? HOSTED_PROGRESS : OSS_PROGRESS;

  const [step, setStep] = useState<Step>("name");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Wizard data
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("🏠");
  const [dbUrl, setDbUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [accountEmail, setAccountEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [hostedWorkspaceId, setHostedWorkspaceId] = useState<string | null>(null);

  // DB validation state
  const [dbStatus, setDbStatus] = useState<"idle" | "validating" | "schema-needed" | "connected" | "error">("idle");
  const [dbError, setDbError] = useState<string | null>(null);
  const [schemaSql, setSchemaSql] = useState<string | null>(null);
  const [sqlEditorUrl, setSqlEditorUrl] = useState<string | null>(null);
  const [schemaConfirming, setSchemaConfirming] = useState(false);

  const advance = useCallback(() => {
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) {
      setError(null);
      setDirection("forward");
      setStep(steps[idx + 1]);
    }
  }, [step, steps]);

  const goBack = useCallback(() => {
    const idx = steps.indexOf(step);
    if (idx > 0) {
      setError(null);
      setDirection("backward");
      setStep(steps[idx - 1]);
    }
  }, [step, steps]);

  // Handle Stripe return
  useEffect(() => {
    if (!isHosted) return;
    if (searchParams.get("stripe_success") === "1") {
      setStep("provisioning");
      const url = new URL(window.location.href);
      url.searchParams.delete("stripe_success");
      window.history.replaceState({}, "", url.toString());
    }
    if (searchParams.get("stripe_canceled") === "1") {
      setStep("payment");
      const url = new URL(window.location.href);
      url.searchParams.delete("stripe_canceled");
      window.history.replaceState({}, "", url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Name step ───
  const handleNameContinue = useCallback(() => {
    if (!label.trim()) return;
    setDirection("forward");
    setError(null);
    setStep(steps[1]);
  }, [label, steps]);

  // ─── Database step (OSS) ───
  const handleValidateDb = useCallback(() => {
    setDbStatus("validating");
    setDbError(null);
    startTransition(async () => {
      const r = await validateNewWorkspaceDb({
        url: dbUrl.trim(),
        anonKey: anonKey.trim(),
        serviceRoleKey: serviceRoleKey.trim(),
      });
      if (!r.ok) {
        setDbStatus("error");
        setDbError(r.error ?? "Connection failed");
        return;
      }
      if (r.data?.schemaNeeded) {
        setDbStatus("schema-needed");
        setSchemaSql(r.data.sql ?? null);
        setSqlEditorUrl(r.data.sqlEditorUrl ?? null);
      } else {
        setDbStatus("connected");
      }
    });
  }, [dbUrl, anonKey, serviceRoleKey, startTransition]);

  const handleConfirmSchema = useCallback(() => {
    setSchemaConfirming(true);
    startTransition(async () => {
      const r = await confirmNewWorkspaceSchema({
        url: dbUrl.trim(),
        anonKey: anonKey.trim(),
        serviceRoleKey: serviceRoleKey.trim(),
      });
      setSchemaConfirming(false);
      if (r.ok) {
        setDbStatus("connected");
      } else {
        setDbError(r.error ?? "Schema verification failed");
      }
    });
  }, [dbUrl, anonKey, serviceRoleKey, startTransition]);

  // ─── Account step (OSS) ───
  const handleCreateWorkspace = useCallback(() => {
    startTransition(async () => {
      const r = await createOssWorkspace({
        label: label.trim(),
        emoji,
        url: dbUrl.trim(),
        anonKey: anonKey.trim(),
        serviceRoleKey: serviceRoleKey.trim(),
        email: accountEmail.trim(),
        password,
      });
      if (!r.ok) {
        setError(r.error ?? "Failed to create workspace");
        return;
      }
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        await supabase.auth.signInWithPassword({
          email: accountEmail.trim(),
          password,
        });
      } catch {
        // If sign-in fails the user can sign in manually
      }
      advance();
    });
  }, [label, emoji, dbUrl, anonKey, serviceRoleKey, accountEmail, password, startTransition, advance]);

  // ─── Payment step (Hosted) ───
  const handlePaymentCheckout = useCallback(async () => {
    setError(null);
    try {
      const result = await createHostedWorkspaceCheckout({
        email: initialEmail ?? "",
        ownerName: "",
        workspaceLabel: label.trim() || "My Workspace",
        workspaceEmoji: emoji,
      });
      setHostedWorkspaceId(result.workspaceId);
      window.location.href = result.url;
    } catch (err) {
      setError((err as Error).message);
    }
  }, [initialEmail, label, emoji]);

  // ─── Provisioning complete (Hosted) ───
  const handleProvisionComplete = useCallback(
    async (tokenHash: string | null, tokenType: string) => {
      if (tokenHash) {
        await verifyAutoLogin(tokenHash, tokenType as "magiclink" | "email");
      }
      advance();
    },
    [advance],
  );

  const currentIndex = steps.indexOf(step);
  const isFirst = currentIndex === 0;

  return (
    <div className="flex w-full flex-col items-center pt-8">
      <div className="mb-8 w-full max-w-lg">
        <WizardProgress steps={progressSteps} currentStep={step} />
      </div>

      <div className="w-full max-w-lg">
        {!isFirst && step !== "provisioning" && step !== "done" && (
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className="mb-4 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back
          </button>
        )}

        {error && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive animate-in fade-in duration-200">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        <div
          key={step}
          className={cn(
            "animate-in fade-in duration-300",
            direction === "forward" ? "slide-in-from-right-4" : "slide-in-from-left-4",
          )}
        >
          {step === "name" && (
            <NameStep
              label={label}
              emoji={emoji}
              onLabelChange={setLabel}
              onEmojiChange={setEmoji}
              onContinue={handleNameContinue}
              pending={pending}
            />
          )}

          {step === "database" && (
            <DatabaseStep
              dbUrl={dbUrl}
              anonKey={anonKey}
              serviceRoleKey={serviceRoleKey}
              onDbUrlChange={setDbUrl}
              onAnonKeyChange={setAnonKey}
              onServiceRoleKeyChange={setServiceRoleKey}
              status={dbStatus}
              error={dbError}
              schemaSql={schemaSql}
              sqlEditorUrl={sqlEditorUrl}
              schemaConfirming={schemaConfirming}
              onValidate={handleValidateDb}
              onConfirmSchema={handleConfirmSchema}
              onContinue={advance}
              pending={pending}
            />
          )}

          {step === "account" && (
            <AccountStep
              email={accountEmail}
              password={password}
              onEmailChange={setAccountEmail}
              onPasswordChange={setPassword}
              onSubmit={handleCreateWorkspace}
              pending={pending}
            />
          )}

          {step === "payment" && (
            <PaymentStep
              workspaceLabel={label.trim() || "My Workspace"}
              email={initialEmail ?? ""}
              onCheckout={handlePaymentCheckout}
              pending={pending}
            />
          )}

          {step === "provisioning" && (
            <StepProvisioning
              workspaceId={hostedWorkspaceId || ""}
              onComplete={handleProvisionComplete}
            />
          )}

          {step === "done" && (
            <DoneStep
              workspaceName={label.trim() || "My Workspace"}
              onGoToDashboard={() => {
                window.location.href = "/dashboard";
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Name Step ──────────────────────────────────────────────────────────────

function NameStep({
  label,
  emoji,
  onLabelChange,
  onEmojiChange,
  onContinue,
  pending,
}: {
  label: string;
  emoji: string;
  onLabelChange: (v: string) => void;
  onEmojiChange: (v: string) => void;
  onContinue: () => void;
  pending: boolean;
}) {
  const valid = label.trim().length > 0;

  return (
    <div className="space-y-8">
      <StaggeredEntrance index={0}>
        <div className="space-y-3">
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
            New workspace
          </h1>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
            Each workspace is fully isolated — contacts, agents, tasks, and settings don&apos;t mix.
          </p>
        </div>
      </StaggeredEntrance>

      <StaggeredEntrance index={1}>
        <div className="grid grid-cols-[72px_1fr] gap-3">
          <div className="space-y-1.5">
            <label htmlFor="ws-emoji" className="text-[13px] font-medium text-foreground">
              Icon
            </label>
            <input
              id="ws-emoji"
              type="text"
              value={emoji}
              onChange={(e) => onEmojiChange(e.target.value)}
              maxLength={8}
              className="flex h-10 w-full rounded-lg border border-border/60 bg-background text-center text-base outline-none transition-colors focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ws-label" className="text-[13px] font-medium text-foreground">
              Workspace name
            </label>
            <input
              id="ws-label"
              type="text"
              value={label}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder="e.g. Sales team, Side project"
              maxLength={80}
              autoFocus
              className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && !pending) onContinue();
              }}
            />
          </div>
        </div>
      </StaggeredEntrance>

      <StaggeredEntrance index={2}>
        <button
          type="button"
          onClick={onContinue}
          disabled={!valid || pending}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
            !valid || pending
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
          )}
        >
          Continue
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </StaggeredEntrance>
    </div>
  );
}

// ── Database Step (OSS) ────────────────────────────────────────────────────

function DatabaseStep({
  dbUrl,
  anonKey,
  serviceRoleKey,
  onDbUrlChange,
  onAnonKeyChange,
  onServiceRoleKeyChange,
  status,
  error,
  schemaSql,
  sqlEditorUrl,
  schemaConfirming,
  onValidate,
  onConfirmSchema,
  onContinue,
  pending,
}: {
  dbUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  onDbUrlChange: (v: string) => void;
  onAnonKeyChange: (v: string) => void;
  onServiceRoleKeyChange: (v: string) => void;
  status: "idle" | "validating" | "schema-needed" | "connected" | "error";
  error: string | null;
  schemaSql: string | null;
  sqlEditorUrl: string | null;
  schemaConfirming: boolean;
  onValidate: () => void;
  onConfirmSchema: () => void;
  onContinue: () => void;
  pending: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const credsValid = dbUrl.includes("supabase") && anonKey.length >= 20 && serviceRoleKey.length >= 20;

  const handleCopySql = () => {
    if (!schemaSql) return;
    navigator.clipboard.writeText(schemaSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Database
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Connect your database
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          Paste your Supabase URL and API keys. Each workspace gets its own isolated database.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="nw-url" className="text-[13px] font-medium text-foreground">
            Supabase URL
          </label>
          <input
            id="nw-url"
            type="url"
            value={dbUrl}
            onChange={(e) => onDbUrlChange(e.target.value)}
            placeholder="https://xxxxxxxx.supabase.co"
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-[13px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="nw-anon" className="text-[13px] font-medium text-foreground">
            Anon key
          </label>
          <input
            id="nw-anon"
            type="text"
            value={anonKey}
            onChange={(e) => onAnonKeyChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="eyJhbGciOi…"
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-[12px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="nw-service" className="text-[13px] font-medium text-foreground">
            Service role key
          </label>
          <input
            id="nw-service"
            type="password"
            value={serviceRoleKey}
            onChange={(e) => onServiceRoleKeyChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="eyJhbGciOi…"
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-[12px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {status === "schema-needed" && (
        <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-[13px] font-medium text-foreground">Schema required</p>
          <p className="text-[12px] text-muted-foreground">
            Run the SQL below in your Supabase SQL editor, then click &ldquo;Verify&rdquo;.
          </p>
          {sqlEditorUrl && (
            <a
              href={sqlEditorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-foreground underline underline-offset-2"
            >
              Open SQL editor
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {schemaSql && (
            <div className="relative">
              <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-3 text-[11px] font-mono text-muted-foreground">
                {schemaSql.slice(0, 500)}{schemaSql.length > 500 ? "…" : ""}
              </pre>
              <button
                type="button"
                onClick={handleCopySql}
                className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onConfirmSchema}
            disabled={schemaConfirming}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium transition-all",
              schemaConfirming
                ? "cursor-wait bg-muted text-muted-foreground/50"
                : "bg-foreground text-background hover:bg-foreground/90",
            )}
          >
            {schemaConfirming ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Verifying…
              </>
            ) : (
              "Verify schema"
            )}
          </button>
        </div>
      )}

      {status === "connected" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2.5 text-[12px] text-green-700 dark:text-green-400">
          <Check className="h-3.5 w-3.5" />
          Connected successfully
        </div>
      )}

      <div className="flex items-center gap-3">
        {status !== "connected" ? (
          <button
            type="button"
            onClick={onValidate}
            disabled={!credsValid || status === "validating" || pending}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
              !credsValid || status === "validating" || pending
                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
            )}
          >
            {status === "validating" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Validating…
              </>
            ) : (
              <>
                Connect
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onContinue}
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background transition-all hover:bg-foreground/90 active:scale-[0.97]"
          >
            Continue
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Account Step (OSS) ─────────────────────────────────────────────────────

function AccountStep({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  pending,
}: {
  email: string;
  password: string;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const valid = email.includes("@") && email.includes(".") && password.length >= 6;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Account
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Secure this workspace
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          Create login credentials for this workspace. You can use the same email as your other workspaces.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="nw-email" className="text-[13px] font-medium text-foreground">
            Email
          </label>
          <input
            id="nw-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid && !pending) onSubmit();
            }}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="nw-password" className="text-[13px] font-medium text-foreground">
            Password
          </label>
          <div className="relative">
            <input
              id="nw-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              className="flex h-10 w-full rounded-lg border border-border/60 bg-background pl-3 pr-10 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && !pending) onSubmit();
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!valid || pending}
        className={cn(
          "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
          !valid || pending
            ? "cursor-not-allowed bg-muted text-muted-foreground/50"
            : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
        )}
      >
        {pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Creating workspace…
          </>
        ) : (
          <>
            Create workspace
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>
    </div>
  );
}

// ── Payment Step (Hosted) ──────────────────────────────────────────────────

function PaymentStep({
  workspaceLabel,
  email,
  onCheckout,
  pending,
}: {
  workspaceLabel: string;
  email: string;
  onCheckout: () => void;
  pending: boolean;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    await onCheckout();
    setLoading(false);
  };

  const isLoading = loading || pending;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Payment
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Activate your workspace
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          You&apos;ll be redirected to Stripe to complete payment, then we&apos;ll
          set everything up automatically.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Workspace</span>
          <span className="font-medium">{workspaceLabel}</span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Account</span>
          <span className="font-medium">{email}</span>
        </div>
        <div className="border-t border-border/40 pt-3 flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium">Pro &mdash; $30/mo</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={cn(
          "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
          isLoading
            ? "cursor-wait bg-muted text-muted-foreground/50"
            : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
        )}
      >
        <CreditCard className="h-3.5 w-3.5" />
        {isLoading ? "Redirecting to Stripe..." : "Continue to payment"}
        {!isLoading && (
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        )}
      </button>

      <p className="text-[11px] text-muted-foreground/60">
        Secure payment via Stripe. Cancel anytime from your account settings.
      </p>
    </div>
  );
}

// ── Done Step ──────────────────────────────────────────────────────────────

function DoneStep({
  workspaceName,
  onGoToDashboard,
}: {
  workspaceName: string;
  onGoToDashboard: () => void;
}) {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowContent(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <div className="mb-6">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="text-green-500">
          <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="2" opacity="0.2" />
          <circle
            cx="32" cy="32" r="30"
            stroke="currentColor" strokeWidth="2"
            strokeDasharray="188.5" strokeDashoffset="188.5" strokeLinecap="round"
            style={{ animation: "check-draw 0.6s ease-out 0.2s forwards" }}
          />
          <path
            d="M20 33 L28 41 L44 25"
            stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="40" strokeDashoffset="40"
            style={{ animation: "check-draw 0.4s ease-out 0.7s forwards" }}
          />
        </svg>
      </div>

      {showContent && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
            {workspaceName} is ready
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Your new workspace has been created. Switch to it from the sidebar.
          </p>
          <div className="pt-4">
            <button
              type="button"
              onClick={onGoToDashboard}
              className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background transition-all hover:bg-foreground/90 active:scale-[0.97]"
            >
              Go to dashboard
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
