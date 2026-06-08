"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  AlertCircle,
  CreditCard,
  Eye,
  EyeOff,
  Copy,
  CheckCheck,
  ExternalLink,
  Zap,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StaggeredEntrance } from "@/components/onboarding/wizard/staggered-entrance";
import { WizardProgress } from "@/components/onboarding/wizard/wizard-progress";
import { StepProvisioning } from "@/components/onboarding/wizard/step-provisioning";
import { StepIntent } from "@/components/onboarding/wizard/step-intent";
import { StepProvider, type StepProviderActions } from "@/components/onboarding/wizard/step-provider";
import { StepAgent } from "@/components/onboarding/wizard/step-agent";
import { AGENT_ROSTER, INTENT_TO_AGENT_KEY } from "@/lib/agents/roster";
import {
  validateNewWorkspaceDb,
  confirmNewWorkspaceSchema,
  runNewWorkspaceOneClickMigration,
  extractProjectRefFromUrl,
  createHostedWorkspaceCheckout,
  registerNewWorkspaceDb,
  mintNewWorkspaceGatewayToken,
  pollNewWorkspaceGateway,
  startLocalNewWorkspaceGateway,
  connectNewWorkspaceProvider,
  startNewWorkspaceOAuth,
  submitNewWorkspaceOAuthPaste,
  pollNewWorkspaceCommandState,
  saveNewWorkspaceOAuthProvider,
  createNewWorkspaceAgent,
  pollNewWorkspaceAgentProvision,
  finalizeNewWorkspace,
} from "@/app/new-workspace/actions";
import { verifyAutoLogin } from "@/components/onboarding/wizard/hosted-actions";

type Step = "name" | "intent" | "database" | "gateway" | "provider" | "agent" | "account" | "payment" | "provisioning" | "done";

const OSS_STEPS: Step[] = ["name", "intent", "database", "gateway", "provider", "agent", "account", "done"];
const HOSTED_STEPS: Step[] = ["name", "payment", "provisioning", "done"];

const OSS_PROGRESS = [
  { key: "name", label: "Name" },
  { key: "intent", label: "Focus" },
  { key: "database", label: "Database" },
  { key: "gateway", label: "Gateway" },
  { key: "provider", label: "AI" },
  { key: "agent", label: "Agent" },
  { key: "account", label: "Account" },
];

const HOSTED_PROGRESS = [
  { key: "name", label: "Name" },
  { key: "payment", label: "Payment" },
  { key: "provisioning", label: "Setup" },
  { key: "done", label: "Done" },
];

const STEP_LAYOUT: Record<string, "narrow" | "wide"> = {
  name: "narrow",
  intent: "narrow",
  database: "narrow",
  gateway: "wide",
  provider: "wide",
  agent: "wide",
  account: "narrow",
  payment: "narrow",
  provisioning: "narrow",
  done: "narrow",
};

interface Props {
  isHosted: boolean;
  email?: string;
}

export function NewWorkspaceWizard({ isHosted, email: initialEmail }: Props) {
  const searchParams = useSearchParams();
  const steps = isHosted ? HOSTED_STEPS : OSS_STEPS;
  const progressSteps = isHosted ? HOSTED_PROGRESS : OSS_PROGRESS;

  const [step, setStep] = useState<Step>("name");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Wizard data
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("\u{1F3E0}");
  const [intentKey, setIntentKey] = useState<string | null>(null);
  const [dbUrl, setDbUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [hostedWorkspaceId, setHostedWorkspaceId] = useState<string | null>(null);

  // Gateway state
  const [gatewayPlacement, setGatewayPlacement] = useState<"local" | "remote" | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<"idle" | "starting" | "polling" | "connected" | "error">("idle");
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [gatewayOneLiner, setGatewayOneLiner] = useState<string | null>(null);
  const [_gatewayTokenId, setGatewayTokenId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Provider state
  const [providerId, setProviderId] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Agent state
  const [provisionStatus, setProvisionStatus] = useState<"idle" | "provisioning" | "ready" | "error">("idle");
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [agentEmoji, setAgentEmoji] = useState<string | null>(null);

  // DB validation state
  const [dbStatus, setDbStatus] = useState<"idle" | "validating" | "schema-needed" | "connected" | "error">("idle");
  const [dbError, setDbError] = useState<string | null>(null);
  const [schemaSql, setSchemaSql] = useState<string | null>(null);
  const [sqlEditorUrl, setSqlEditorUrl] = useState<string | null>(null);
  const [schemaConfirming, setSchemaConfirming] = useState(false);
  const [projectRef, setProjectRef] = useState<string | null>(null);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationHint, setMigrationHint] = useState<string | null>(null);

  const oauthActions: StepProviderActions = useMemo(() => ({
    startOAuthFlow: (provider, mode) =>
      startNewWorkspaceOAuth(workspaceId!, provider, mode),
    submitOAuthPaste: (parentCommandId, value) =>
      submitNewWorkspaceOAuthPaste(workspaceId!, parentCommandId, value),
    pollCommandState: (commandId) =>
      pollNewWorkspaceCommandState(workspaceId!, commandId),
    saveOAuthProvider: (provider) =>
      saveNewWorkspaceOAuthProvider(workspaceId!, provider),
  }), [workspaceId]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (step !== "provider") {
      setValidating(false);
      setValidated(false);
      setValidationError(null);
    }
  }, [step]);

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

  // ─── Intent step ───
  const handleIntent = useCallback((key: string) => {
    setIntentKey(key);
    setDirection("forward");
    setError(null);
    setStep("database");
  }, []);

  // ─── Database step (OSS) ───
  const handleValidateDb = useCallback(() => {
    setDbStatus("validating");
    setDbError(null);
    setMigrationError(null);
    setMigrationHint(null);
    startTransition(async () => {
      const ref = await extractProjectRefFromUrl(dbUrl.trim());
      setProjectRef(ref);

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
        if (r.data.projectRef) setProjectRef(r.data.projectRef);
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

  const handleRunOneClick = useCallback((region: string, dbPassword: string) => {
    if (!projectRef) return;
    setMigrationRunning(true);
    setMigrationError(null);
    setMigrationHint(null);
    startTransition(async () => {
      const r = await runNewWorkspaceOneClickMigration({
        projectRef,
        region,
        dbPassword,
      });
      setMigrationRunning(false);
      if (r.ok) {
        setDbStatus("connected");
      } else {
        setMigrationError(r.error ?? "Migration failed");
        setMigrationHint(r.hint ?? null);
      }
    });
  }, [projectRef, startTransition]);

  const handleDbContinue = useCallback(() => {
    startTransition(async () => {
      const r = await registerNewWorkspaceDb({
        label: label.trim(),
        emoji,
        url: dbUrl.trim(),
        anonKey: anonKey.trim(),
        serviceRoleKey: serviceRoleKey.trim(),
      });
      if (!r.ok) {
        setError(r.error ?? "Failed to register workspace");
        return;
      }
      setWorkspaceId(r.data?.workspaceId ?? null);
      advance();
    });
  }, [label, emoji, dbUrl, anonKey, serviceRoleKey, startTransition, advance]);

  // ─── Gateway step ───
  const handleChooseGateway = useCallback((placement: "local" | "remote") => {
    setGatewayPlacement(placement);
    setGatewayStatus("starting");
    setGatewayError(null);
    setGatewayOneLiner(null);

    startTransition(async () => {
      if (placement === "local") {
        const r = await startLocalNewWorkspaceGateway();
        if (!r.ok) {
          setGatewayStatus("error");
          setGatewayError(r.error ?? "Failed to start gateway");
        } else {
          setGatewayStatus("polling");
        }
      } else {
        const r = await mintNewWorkspaceGatewayToken(workspaceId!);
        if (!r.ok || !r.data) {
          setGatewayStatus("error");
          setGatewayError(r.error ?? "Failed to mint token");
          return;
        }
        setGatewayOneLiner(r.data.oneLiner);
        setGatewayTokenId(r.data.tokenId);
        setGatewayStatus("polling");
      }

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const poll = await pollNewWorkspaceGateway(workspaceId!);
        if (poll.ok && poll.data?.status === "ready") {
          if (pollRef.current) clearInterval(pollRef.current);
          setGatewayStatus("connected");
        }
      }, 3000);
    });
  }, [startTransition, workspaceId]);

  const handleGatewaySkip = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    advance();
  }, [advance]);

  const handleGatewayContinue = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    advance();
  }, [advance]);

  // ─── Provider step ───
  const handleProvider = useCallback((provider: string, apiKey: string) => {
    setValidating(true);
    setValidationError(null);
    startTransition(async () => {
      const r = await connectNewWorkspaceProvider(workspaceId!, provider, apiKey);
      setValidating(false);
      if (r.ok) {
        setValidated(true);
        setProviderId(provider);
        setTimeout(() => advance(), 600);
      } else {
        setValidationError(r.error ?? "Could not validate key");
      }
    });
  }, [startTransition, advance, workspaceId]);

  // ─── Agent step ───
  const getRecommendedKey = (): string => {
    const key = intentKey ?? "organized";
    return INTENT_TO_AGENT_KEY[key] ?? "assistant";
  };

  const handleCreateAgent = useCallback(
    async (agentData: { name: string; emoji: string; templateBranch: string }) => {
      const r = await createNewWorkspaceAgent(workspaceId!, {
        agentName: agentData.name,
        agentEmoji: agentData.emoji,
        templateBranch: agentData.templateBranch,
        providerId: providerId ?? undefined,
      });
      if (!r.ok || !r.data) {
        setError(r.error ?? "Failed to create agent");
        return null;
      }

      const { agentId, provisionCommandId } = r.data;
      setAgentName(agentData.name);
      setAgentEmoji(agentData.emoji);
      setProvisionStatus("provisioning");

      if (provisionCommandId) {
        const wsId = workspaceId!;
        const startedAt = Date.now();
        const interval = setInterval(async () => {
          const status = await pollNewWorkspaceAgentProvision(wsId, provisionCommandId);
          if (status === "completed") {
            clearInterval(interval);
            setProvisionStatus("ready");
          } else if (status === "error") {
            clearInterval(interval);
            setProvisionStatus("error");
            setProvisionError("Agent provisioning failed");
          } else if (Date.now() - startedAt > 120_000) {
            clearInterval(interval);
            setProvisionStatus("ready");
          }
        }, 3000);
      }

      return { agentId, provisionCommandId };
    },
    [providerId, workspaceId],
  );

  const agentDoneFired = useRef(false);
  useEffect(() => {
    if (step !== "agent") {
      agentDoneFired.current = false;
      return;
    }
    if (agentDoneFired.current) return;
    if (provisionStatus === "ready" || provisionStatus === "error") {
      agentDoneFired.current = true;
      const timer = setTimeout(() => advance(), 800);
      return () => clearTimeout(timer);
    }
  }, [step, provisionStatus, advance]);

  // ─── Account step (OSS) ───
  const handleCreateWorkspace = useCallback(() => {
    startTransition(async () => {
      const r = await finalizeNewWorkspace(workspaceId!, {
        email: accountEmail.trim(),
        password,
        contextPresetKey: intentKey,
        workspaceName: label.trim() || "My Workspace",
        ownerName: "",
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
  }, [accountEmail, password, intentKey, label, startTransition, advance, workspaceId]);

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
  const layout = STEP_LAYOUT[step] ?? "narrow";

  return (
    <div className="flex w-full flex-col items-center pt-8">
      <div className={cn(
        "w-full transition-all duration-300",
        layout === "narrow" ? "max-w-lg" : "max-w-3xl",
      )}>
        <div className="mb-8">
          <WizardProgress steps={progressSteps} currentStep={step} />
        </div>
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

          {step === "intent" && (
            <StepIntent
              ownerName=""
              initialKey={intentKey}
              onSubmit={handleIntent}
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
              projectRef={projectRef}
              migrationRunning={migrationRunning}
              migrationError={migrationError}
              migrationHint={migrationHint}
              onValidate={handleValidateDb}
              onConfirmSchema={handleConfirmSchema}
              onRunOneClick={handleRunOneClick}
              onContinue={handleDbContinue}
              pending={pending}
            />
          )}

          {step === "gateway" && (
            <GatewayStep
              status={gatewayStatus}
              error={gatewayError}
              placement={gatewayPlacement}
              oneLiner={gatewayOneLiner}
              onChoose={handleChooseGateway}
              onSkip={handleGatewaySkip}
              onContinue={handleGatewayContinue}
              pending={pending}
            />
          )}

          {step === "provider" && (
            <StepProvider
              onSubmit={handleProvider}
              pending={pending}
              validating={validating}
              validated={validated}
              validationError={validationError}
              isHosted={false}
              collectOnly={false}
              actions={oauthActions}
            />
          )}

          {step === "agent" && (
            <StepAgent
              roster={AGENT_ROSTER}
              recommendedKey={getRecommendedKey()}
              onCreateAgent={handleCreateAgent}
              provisionStatus={provisionStatus}
              provisionError={provisionError}
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
              agentName={agentName}
              agentEmoji={agentEmoji}
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
              className="flex h-10 w-full rounded-lg border border-border/60 bg-background text-center text-base outline-none transition-colors focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
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
              className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
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
              : "bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.97]",
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

const SUPABASE_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ca-central-1", label: "Canada (Central)" },
  { value: "eu-west-1", label: "EU West (Ireland)" },
  { value: "eu-west-2", label: "EU West (London)" },
  { value: "eu-west-3", label: "EU West (Paris)" },
  { value: "eu-central-1", label: "EU Central (Frankfurt)" },
  { value: "eu-central-2", label: "EU Central (Zurich)" },
  { value: "eu-north-1", label: "EU North (Stockholm)" },
  { value: "ap-south-1", label: "South Asia (Mumbai)" },
  { value: "ap-southeast-1", label: "Southeast Asia (Singapore)" },
  { value: "ap-southeast-2", label: "Oceania (Sydney)" },
  { value: "ap-northeast-1", label: "Northeast Asia (Tokyo)" },
  { value: "ap-northeast-2", label: "Northeast Asia (Seoul)" },
  { value: "sa-east-1", label: "South America (Sao Paulo)" },
];

function SchemaInstallPanelNW({
  schemaSql,
  sqlEditorUrl,
  schemaConfirming,
  migrationRunning,
  migrationError,
  migrationHint,
  projectRef,
  onRunOneClick,
  onConfirmSchema,
}: {
  schemaSql: string | null;
  sqlEditorUrl: string | null;
  schemaConfirming: boolean;
  migrationRunning: boolean;
  migrationError: string | null;
  migrationHint: string | null;
  projectRef: string | null;
  onRunOneClick: (region: string, dbPassword: string) => void;
  onConfirmSchema: () => void;
}) {
  const [showManual, setShowManual] = useState(false);
  const [region, setRegion] = useState("us-east-1");
  const [dbPassword, setDbPassword] = useState("");

  const busy = migrationRunning || schemaConfirming;

  return (
    <div className="space-y-4 rounded-xl border border-status-warning/30 bg-status-warning/[0.04] px-4 py-4">
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Auto-install path */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowManual(false)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowManual(false); } }}
          className={cn(
            "rounded-lg border p-4 transition-all",
            !showManual
              ? "border-foreground/20 bg-foreground/[0.02]"
              : "border-border/40 bg-transparent cursor-pointer hover:border-border/60 hover:bg-foreground/[0.01]",
          )}
        >
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
              !showManual ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground/60",
            )}>
              <Zap className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1">
              <p className={cn(
                "text-[12px] font-semibold",
                !showManual ? "text-foreground" : "text-foreground/70",
              )}>
                Automatic install
              </p>
              {showManual && (
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                  We handle everything — just provide your DB password
                </p>
              )}
            </div>
            {!showManual && (
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
              </div>
            )}
          </div>
          {!showManual && (
            <div className="mt-3 space-y-3 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
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
                  Set when you created the project. Find it in Settings {"->"} Database.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onRunOneClick(region, dbPassword)}
                disabled={busy || !dbPassword.trim() || !projectRef}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-medium transition-all",
                  busy || !dbPassword.trim() || !projectRef
                    ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                    : "bg-foreground/[0.08] text-foreground hover:bg-foreground/[0.13]",
                )}
              >
                {migrationRunning ? (
                  <><Loader2 className="h-3 w-3 animate-spin" />Installing...</>
                ) : "Install schema"}
              </button>
            </div>
          )}
        </div>

        {/* Manual SQL path */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowManual(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowManual(true); } }}
          className={cn(
            "rounded-lg border p-4 transition-all",
            showManual
              ? "border-foreground/20 bg-foreground/[0.02]"
              : "border-border/40 bg-transparent cursor-pointer hover:border-border/60 hover:bg-foreground/[0.01]",
          )}
        >
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
              showManual ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground/60",
            )}>
              <FileCode className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1">
              <p className={cn(
                "text-[12px] font-semibold",
                showManual ? "text-foreground" : "text-foreground/70",
              )}>
                Manual SQL
              </p>
              {!showManual && (
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                  Copy and run the SQL yourself in Supabase
                </p>
              )}
            </div>
            {showManual && (
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
              </div>
            )}
          </div>
          {showManual && (
            <div className="mt-3 space-y-3 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
              <p className="text-[12px] text-muted-foreground">
                Open your Supabase SQL editor, paste the script below, and click{" "}
                <span className="font-medium text-foreground">Run</span>.
              </p>

              {sqlEditorUrl && (
                <a
                  href={sqlEditorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-card/70"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open SQL editor
                </a>
              )}

              {schemaSql && (
                <div className="relative rounded-lg border border-border/40 bg-muted/30">
                  <div className="absolute right-2 top-2">
                    <CopyButtonInline text={schemaSql} />
                  </div>
                  <pre className="max-h-40 overflow-y-auto px-3 py-3 pr-8 text-[11px] leading-relaxed text-muted-foreground">
                    {schemaSql.slice(0, 600)}{schemaSql.length > 600 ? "\n...(truncated)" : ""}
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
                {schemaConfirming ? (
                  <><Loader2 className="h-3 w-3 animate-spin" />Checking...</>
                ) : "I ran it — verify"}
              </button>
            </div>
          )}
        </div>
      </div>

      {migrationError && (
        <div className="space-y-0.5">
          <p className="text-[12px] text-destructive">{migrationError}</p>
          {migrationHint && (
            <p className="text-[11px] text-muted-foreground">{migrationHint}</p>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButtonInline({ text }: { text: string }) {
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
  projectRef,
  migrationRunning,
  migrationError,
  migrationHint,
  onValidate,
  onConfirmSchema,
  onRunOneClick,
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
  projectRef: string | null;
  migrationRunning: boolean;
  migrationError: string | null;
  migrationHint: string | null;
  onValidate: () => void;
  onConfirmSchema: () => void;
  onRunOneClick: (region: string, dbPassword: string) => void;
  onContinue: () => void;
  pending: boolean;
}) {
  const credsValid = dbUrl.includes("supabase") && anonKey.length >= 20 && serviceRoleKey.length >= 20;

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
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-[13px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
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
            placeholder="eyJhbGciOi..."
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-[12px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
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
            placeholder="eyJhbGciOi..."
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 font-mono text-[12px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
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
        <SchemaInstallPanelNW
          schemaSql={schemaSql}
          sqlEditorUrl={sqlEditorUrl}
          schemaConfirming={schemaConfirming}
          migrationRunning={migrationRunning}
          migrationError={migrationError}
          migrationHint={migrationHint}
          projectRef={projectRef}
          onRunOneClick={onRunOneClick}
          onConfirmSchema={onConfirmSchema}
        />
      )}

      {status === "connected" && (
        <div className="flex items-center gap-2 rounded-lg border border-status-success/30 bg-status-success/5 px-3 py-2.5 text-[12px] text-status-success">
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
                : "bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.97]",
            )}
          >
            {status === "validating" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Validating...
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
            disabled={pending}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
              pending
                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
            )}
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Registering...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Gateway Step ─────────────────────────────────────────────────────────

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

function GatewayStep({
  status,
  error,
  placement,
  oneLiner,
  onChoose,
  onSkip,
  onContinue,
  pending,
}: {
  status: "idle" | "starting" | "polling" | "connected" | "error";
  error: string | null;
  placement: "local" | "remote" | null;
  oneLiner: string | null;
  onChoose: (placement: "local" | "remote") => void;
  onSkip: () => void;
  onContinue: () => void;
  pending: boolean;
}) {
  const isActive = status === "polling" || status === "starting";
  const [tick, setTick] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (!isActive) return;
    startRef.current = tick;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const elapsed = isActive ? tick - startRef.current : 0;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Gateway
        </div>
        <h1 className="text-[24px] md:text-[28px] font-semibold leading-[1.15] tracking-tight">
          Connect your gateway
        </h1>
        <p className="max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
          The gateway is a lightweight process that runs your AI agents. It connects to your database
          and handles everything from task execution to browser automation.
        </p>
      </div>

      {status === "connected" ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-status-success/20 bg-status-success/[0.04] px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-status-success">
              <Check className="h-3.5 w-3.5" />
              Gateway connected
            </div>
          </div>
          <button
            type="button"
            onClick={onContinue}
            disabled={pending}
            className="group inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-[0.97]"
          >
            Continue
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div role="radiogroup" aria-label="Gateway placement" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              role="radio"
              aria-checked={placement === "local"}
              onClick={() => status === "idle" && onChoose("local")}
              disabled={status !== "idle"}
              className={cn(
                "flex flex-col gap-2.5 rounded-xl border p-4 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                placement === "local"
                  ? "border-primary/50 bg-primary/[0.04] ring-1 ring-primary/10"
                  : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                status !== "idle" && placement !== "local" && "opacity-40 pointer-events-none",
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[18px]">{"\u{1F4BB}"}</span>
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
              onClick={() => status === "idle" && onChoose("remote")}
              disabled={status !== "idle"}
              className={cn(
                "flex flex-col gap-2.5 rounded-xl border p-4 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                placement === "remote"
                  ? "border-primary/50 bg-primary/[0.04] ring-1 ring-primary/10"
                  : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                status !== "idle" && placement !== "remote" && "opacity-40 pointer-events-none",
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-[18px]">{"☁️"}</span>
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

          {oneLiner && (status === "polling" || status === "starting") && (
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
                  <CopyButton text={oneLiner} />
                </div>
                <pre className="overflow-x-auto px-3 py-3 pr-10 text-[11px] leading-relaxed font-mono text-foreground whitespace-pre-wrap break-all">
                  {oneLiner}
                </pre>
              </div>
              <p className="text-[11px] text-muted-foreground/50">
                This page updates automatically once the gateway connects.
              </p>
            </div>
          )}

          {(status === "starting" || status === "polling") && !oneLiner && (
            <div className="rounded-xl border border-border/40 bg-card/20 p-4 space-y-3">
              <div className="space-y-2">
                {[
                  { label: "Starting containers", threshold: 0 },
                  { label: "Connecting to your database", threshold: 10 },
                  { label: "Registering gateway", threshold: 20 },
                ].map((s, i, arr) => {
                  const active = elapsed >= s.threshold && (i === arr.length - 1 || elapsed < arr[i + 1].threshold);
                  const done = i < arr.length - 1 && elapsed >= arr[i + 1].threshold;
                  return (
                    <div key={s.label} className="flex items-center gap-2.5">
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
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              {elapsed >= 40 && (
                <p className="text-[11px] text-status-warning animate-in fade-in duration-300">
                  Taking longer than usual — make sure Docker is running.
                </p>
              )}
            </div>
          )}

          {(status === "polling" || status === "starting") && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-[12px] text-muted-foreground">Waiting for gateway to come online...</span>
            </div>
          )}

          {status === "error" && error && (
            <div className="flex items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning/[0.04] px-3 py-2.5 text-[12px] text-foreground">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" />
              <div className="space-y-0.5">
                <span>{error}</span>
                <p className="text-[11px] text-muted-foreground">
                  Make sure Docker is running, then try again.
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onSkip}
            className="text-[13px] text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            Skip for now — I&apos;ll add a gateway later from Settings
          </button>
        </div>
      )}
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
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
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
              className="flex h-10 w-full rounded-lg border border-border/60 bg-background pl-3 pr-10 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
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
            : "bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.97]",
        )}
      >
        {pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Creating workspace...
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
            : "bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.97]",
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
  agentName,
  agentEmoji,
  onGoToDashboard,
}: {
  workspaceName: string;
  agentName?: string | null;
  agentEmoji?: string | null;
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
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="text-status-success">
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
            {agentName
              ? `Your workspace and ${agentEmoji ?? ""} ${agentName} have been set up.`
              : "Your new workspace has been created."
            }
            {" "}Switch to it from the sidebar.
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
