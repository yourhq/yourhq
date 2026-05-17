"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWizardState, clearWizardSession, type WizardData, type WizardStep } from "./use-wizard-state";
import { HqLogo } from "@/components/shared/hq-logo";
import { WizardProgress } from "./wizard-progress";
import { StepWelcome } from "./step-welcome";
import { StepIntent } from "./step-intent";
import { StepInfrastructure, type InfraStatus, type SchemaInstallState } from "./step-infrastructure";
import { StepProvider } from "./step-provider";
import { StepAgent, type AgentRecommendation } from "./step-agent";
import { StepAccount } from "./step-account";
import { StepPayment } from "./step-payment";
import { StepProvisioning } from "./step-provisioning";
import { StepCelebration } from "./step-celebration";
import { FIRST_TASK_SUGGESTIONS } from "@/lib/onboarding/first-task-suggestions";
import { completeItem } from "@/lib/onboarding/progress";
import {
  saveWelcomeStep,
  saveIntentStep,
  connectProvider,
  createFirstAgent,
  pollAgentProvisionStatus,
  createAccountAndFinalize,
  validateAndConnectDb,
  setupGateway,
  advanceInfrastructure,
  prepareSchemaInstallAction,
  runOneClickMigrationAction,
  confirmSchemaInstalledAction,
  saveWorkspaceToRegistry,
  signOutFromOnboarding,
  markOnboardingComplete,
} from "./actions";
import { createHostedCheckout, getHostedEmail, verifyAutoLogin, sendFreshLoginLink } from "./hosted-actions";

const INTENT_TO_TEMPLATE: Record<string, { branch: string; name: string; emoji: string; role: string; description: string }> = {
  reach: { branch: "template/crm-researcher", name: "Scout", emoji: "🦅", role: "Sales & Outreach", description: "Finds prospects, researches companies, and helps you build pipeline." },
  publish: { branch: "template/ghostwriter", name: "Ghost", emoji: "🦎", role: "Content Writer", description: "Writes in your voice across any format — newsletters, posts, threads, and more." },
  run: { branch: "template/chief-of-staff", name: "Chief", emoji: "🦫", role: "Operations", description: "Coordinates tasks, tracks clients, and keeps everything moving forward." },
  hire: { branch: "template/crm-researcher", name: "Scout", emoji: "🦅", role: "Talent Sourcing", description: "Sources candidates, screens profiles, and helps you build a strong pipeline." },
  research: { branch: "template/assistant", name: "Researcher", emoji: "🦉", role: "Research & Analysis", description: "Digs into topics, synthesizes information, and organizes what it finds." },
  organized: { branch: "template/assistant", name: "Assistant", emoji: "🐕", role: "General Assistant", description: "Routes work, tracks moving parts, and helps you stay organized." },
  explore: { branch: "template/assistant", name: "Assistant", emoji: "🐕", role: "General Assistant", description: "Routes work, tracks moving parts, and helps you stay organized." },
};

const STEP_LAYOUT: Record<string, "narrow" | "wide"> = {
  welcome: "narrow",
  intent: "narrow",
  infrastructure: "wide",
  provider: "wide",
  agent: "wide",
  account: "narrow",
  payment: "wide",
  provisioning: "narrow",
};

const OSS_PROGRESS_STEPS = [
  { key: "welcome", label: "Welcome" },
  { key: "intent", label: "Your work" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "provider", label: "AI Provider" },
  { key: "agent", label: "Agent" },
  { key: "account", label: "Account" },
];

const HOSTED_PROGRESS_STEPS = [
  { key: "welcome", label: "Welcome" },
  { key: "intent", label: "Your work" },
  { key: "payment", label: "Setup" },
  { key: "provider", label: "AI Provider" },
  { key: "agent", label: "Agent" },
];

export interface OnboardingWizardProps {
  isHosted: boolean;
  initialStep?: WizardStep;
  initialData?: WizardData;
}

export function OnboardingWizard({ isHosted, initialStep, initialData }: OnboardingWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    step,
    data,
    patch,
    advance,
    goTo,
    goBack,
    direction,
    pending,
    startTransition,
    error,
    setError,
    isFirst,
  } = useWizardState({ isHosted, initialStep, initialData });

  const layout = STEP_LAYOUT[step] ?? "narrow";
  const progressSteps = isHosted ? HOSTED_PROGRESS_STEPS : OSS_PROGRESS_STEPS;
  // Map provisioning to payment for progress bar display (both show as "Setup")
  const progressStep = step === "provisioning" ? "payment" : step;

  // Infrastructure state (OSS only)
  const [infraStatus, setInfraStatus] = useState<InfraStatus>({
    db: "idle",
    gateway: "idle",
  });
  const [schemaInstall, setSchemaInstall] = useState<SchemaInstallState>({
    phase: "idle",
  });
  const dbCredsRef = useRef<{ url: string; anonKey: string; serviceRoleKey: string } | null>(null);

  // Provider state
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "provider") {
      setValidating(false);
      setValidated(false);
      setValidationError(null);
    }
  }, [step]);

  // Agent provisioning state
  const [provisionStatus, setProvisionStatus] = useState<"idle" | "provisioning" | "ready" | "error">("idle");
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Account step error
  const [accountError, setAccountError] = useState<string | null>(null);

  // Celebration screen
  const [showCelebration, setShowCelebration] = useState(false);

  // Hosted payment + provisioning state
  const [hostedEmail, setHostedEmail] = useState<string>("");
  const [hostedWorkspaceId, setHostedWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!isHosted) return;
    getHostedEmail().then((email) => {
      if (email) setHostedEmail(email);
    });
  }, [isHosted]);

  // Handle Stripe return: ?stripe_success=1 means payment went through,
  // jump straight to provisioning step
  useEffect(() => {
    if (!isHosted) return;
    if (searchParams.get("stripe_success") === "1") {
      goTo("provisioning");
      // Clean up the URL
      const url = new URL(window.location.href);
      url.searchParams.delete("stripe_success");
      window.history.replaceState({}, "", url.toString());
    }
    if (searchParams.get("stripe_canceled") === "1") {
      goTo("payment");
      const url = new URL(window.location.href);
      url.searchParams.delete("stripe_canceled");
      window.history.replaceState({}, "", url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─── Welcome ───
  const handleWelcome = useCallback(
    (vals: { ownerName: string; preferredName: string; workspaceName: string; workspaceSlug: string }) => {
      startTransition(async () => {
        const r = await saveWelcomeStep(vals);
        if (!r.ok) return setError(r.error ?? "Something went wrong");
        patch(vals);
        advance();
      });
    },
    [startTransition, patch, advance, setError],
  );

  // ─── Intent ───
  const handleIntent = useCallback(
    (intentKey: string) => {
      startTransition(async () => {
        const r = await saveIntentStep(intentKey);
        if (!r.ok) return setError(r.error ?? "Something went wrong");
        patch({ intentKey, contextPresetKey: intentKey });
        advance();
      });
    },
    [startTransition, patch, advance, setError],
  );

  // ─── Infrastructure (OSS) ───
  const handleValidateDb = useCallback(
    (url: string, anonKey: string, serviceRoleKey: string) => {
      setInfraStatus((s) => ({ ...s, db: "validating", dbError: null }));
      setSchemaInstall({ phase: "idle" });
      startTransition(async () => {
        const r = await validateAndConnectDb({ url, anonKey, serviceRoleKey });
        if (!r.ok) {
          setInfraStatus((s) => ({ ...s, db: "error", dbError: r.error }));
          return;
        }
        patch({ supabaseUrl: url, supabaseAnonKey: anonKey });
        if (r.schemaNeeded) {
          dbCredsRef.current = { url, anonKey, serviceRoleKey };
          const prep = await prepareSchemaInstallAction({ url, anonKey, serviceRoleKey });
          setSchemaInstall({
            phase: "needed",
            projectRef: prep.projectRef ?? null,
            sqlEditorUrl: prep.sqlEditorUrl,
            sql: prep.sql,
          });
          setInfraStatus((s) => ({ ...s, db: "schema-needed" }));
        } else {
          setInfraStatus((s) => ({ ...s, db: "connected" }));
        }
      });
    },
    [startTransition, patch],
  );

  const handleRunOneClick = useCallback(
    (region: string, dbPassword: string) => {
      const creds = dbCredsRef.current;
      if (!creds) return;
      const m = creds.url.match(/https?:\/\/([a-z0-9]{20})\.supabase\.co/i);
      const projectRef = schemaInstall.projectRef ?? (m ? m[1] : "");
      if (!projectRef) {
        setSchemaInstall((s) => ({ ...s, phase: "needed", error: "Couldn't determine your Supabase project ref. Use the SQL editor path instead." }));
        return;
      }
      setSchemaInstall((s) => ({ ...s, phase: "running" }));
      startTransition(async () => {
        const r = await runOneClickMigrationAction({ projectRef, region, dbPassword });
        if (r.ok) {
          await saveWorkspaceToRegistry(creds);
          setSchemaInstall({ phase: "idle" });
          setInfraStatus((s) => ({ ...s, db: "connected" }));
        } else {
          setSchemaInstall((s) => ({ ...s, phase: "needed", error: r.error, hint: r.hint }));
        }
      });
    },
    [startTransition, schemaInstall.projectRef],
  );

  const handleConfirmSchema = useCallback(() => {
    const creds = dbCredsRef.current;
    if (!creds) return;
    setSchemaInstall((s) => ({ ...s, phase: "confirming" }));
    startTransition(async () => {
      const r = await confirmSchemaInstalledAction(creds);
      if (r.ok) {
        await saveWorkspaceToRegistry(creds);
        setSchemaInstall({ phase: "idle" });
        setInfraStatus((s) => ({ ...s, db: "connected" }));
      } else {
        setSchemaInstall((s) => ({ ...s, phase: "needed", error: r.error, hint: r.hint }));
      }
    });
  }, [startTransition]);

  const handleChooseGateway = useCallback(
    (placement: "local" | "remote") => {
      setInfraStatus((s) => ({ ...s, gateway: "starting", gatewayError: null, gatewayManualCmd: undefined }));
      startTransition(async () => {
        const r = await setupGateway(placement);
        if (r.ok) {
          setInfraStatus((s) => ({ ...s, gateway: "polling" }));
          patch({ placement });
          const interval = setInterval(async () => {
            const poll = await import("@/app/onboarding/actions").then((m) => m.pollLocalGateway());
            if (poll.status === "ready") {
              clearInterval(interval);
              setInfraStatus((s) => ({ ...s, gateway: "connected" }));
            }
          }, 3000);
          pollRef.current = interval;
        } else {
          setInfraStatus((s) => ({
            ...s,
            gateway: "error",
            gatewayError: r.error,
            gatewayManualCmd: placement === "local"
              ? "docker compose --profile gateway up -d --pull always --no-build"
              : undefined,
          }));
          patch({ placement });
          const interval = setInterval(async () => {
            const poll = await import("@/app/onboarding/actions").then((m) => m.pollLocalGateway());
            if (poll.status === "ready") {
              clearInterval(interval);
              setInfraStatus((s) => ({ ...s, gateway: "connected", gatewayError: null, gatewayManualCmd: undefined }));
            }
          }, 3000);
          pollRef.current = interval;
        }
      });
    },
    [startTransition, patch],
  );

  const handleInfraContinue = useCallback(() => {
    startTransition(async () => {
      const r = await advanceInfrastructure();
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      advance();
    });
  }, [startTransition, advance, setError]);

  // ─── Provider ───
  const handleProvider = useCallback(
    (provider: string, apiKey: string) => {
      setValidating(true);
      setValidationError(null);
      startTransition(async () => {
        const r = await connectProvider(provider, apiKey);
        setValidating(false);
        if (r.ok) {
          setValidated(true);
          patch({ providerId: provider });
          setTimeout(() => advance(), 600);
        } else {
          setValidationError(r.error ?? "Could not validate key");
        }
      });
    },
    [startTransition, patch, advance],
  );

  // ─── Agent ───
  const getRecommendation = (): AgentRecommendation => {
    const intentKey = (data.intentKey as string) ?? "organized";
    const rec = INTENT_TO_TEMPLATE[intentKey] ?? INTENT_TO_TEMPLATE.organized;
    return {
      templateBranch: rec.branch,
      name: rec.name,
      emoji: rec.emoji,
      description: rec.description,
      role: rec.role,
    };
  };

  const handleCreateAgent = useCallback(
    async (agentData: { name: string; emoji: string; templateBranch: string }) => {
      const r = await createFirstAgent(agentData);
      if (!r.ok || !r.data) {
        setError(r.error ?? "Failed to create agent");
        return null;
      }

      const { agentId, provisionCommandId } = r.data;
      patch({ agentId, agentName: agentData.name, agentEmoji: agentData.emoji });
      setProvisionStatus("provisioning");

      if (provisionCommandId) {
        const startedAt = Date.now();
        const interval = setInterval(async () => {
          const status = await pollAgentProvisionStatus(provisionCommandId);
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
        pollRef.current = interval;
      }

      return { agentId, provisionCommandId };
    },
    [patch, setError],
  );

  const handleSignOut = useCallback(async () => {
    await signOutFromOnboarding();
    if (isHosted) {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push(isHosted ? "/auth" : "/login");
    router.refresh();
  }, [isHosted, router]);

  const navigateToTasks = useCallback(() => {
    clearWizardSession();
    markOnboardingComplete().catch(() => {});

    const progress = localStorage.getItem("hq_onboarding_progress");
    const parsed = progress ? JSON.parse(progress) : {};
    parsed.wizardCompleted = true;
    localStorage.setItem("hq_onboarding_progress", JSON.stringify(parsed));
    window.dispatchEvent(new CustomEvent("hq:onboarding-progress"));

    completeItem("agentCreated");

    const intentKey = (data.intentKey as string) ?? "organized";
    const suggestion = FIRST_TASK_SUGGESTIONS[intentKey];
    const params = new URLSearchParams({ onboarding: "first-task" });
    if (suggestion) params.set("title", suggestion.title);
    if (data.agentId) params.set("agent", data.agentId as string);
    router.push(`/dashboard/tasks?${params.toString()}`);
  }, [data.intentKey, data.agentId, router]);

  const handleAgentDone = useCallback(() => {
    if (isHosted) {
      markOnboardingComplete().catch(() => {});
      setShowCelebration(true);
    } else {
      advance();
    }
  }, [isHosted, advance]);

  // Auto-advance once agent provisioning finishes (ready or error)
  const agentDoneFired = useRef(false);
  useEffect(() => {
    if (step !== "agent") return;
    if (agentDoneFired.current) return;
    if (provisionStatus === "ready" || provisionStatus === "error") {
      agentDoneFired.current = true;
      const timer = setTimeout(handleAgentDone, 800);
      return () => clearTimeout(timer);
    }
  }, [step, provisionStatus, handleAgentDone]);

  // ─── Payment (Hosted) ───
  const handlePaymentCheckout = useCallback(
    async (email: string) => {
      const result = await createHostedCheckout({
        email,
        ownerName: (data.ownerName as string) || "",
        workspaceLabel: (data.workspaceName as string) || "My Workspace",
        workspaceEmoji: "🏠",
        contextPreset: (data.intentKey as string) || "other",
      });
      setHostedWorkspaceId(result.workspaceId);
      patch({ hostedWorkspaceId: result.workspaceId });
      window.location.href = result.url;
    },
    [data.ownerName, data.workspaceName, data.intentKey, patch],
  );

  // ─── Provisioning complete (Hosted) ───
  const [needsManualLogin, setNeedsManualLogin] = useState(false);

  const handleProvisionComplete = useCallback(
    async (tokenHash: string | null, tokenType: string) => {
      if (tokenHash) {
        const result = await verifyAutoLogin(tokenHash, tokenType as "magiclink" | "email");
        if (!result.ok) {
          const hostedEmail = await getHostedEmail().catch(() => null);
          if (hostedEmail) {
            await sendFreshLoginLink(hostedEmail).catch(() => {});
          }
          setNeedsManualLogin(true);
        }
      }
      advance();
    },
    [advance],
  );

  // ─── Account (OSS only) ───
  const handleAccount = useCallback(
    (creds: { email: string; password: string }) => {
      setAccountError(null);
      startTransition(async () => {
        const r = await createAccountAndFinalize(creds);
        if (!r.ok) {
          setAccountError(r.error ?? "Something went wrong");
          return;
        }

        // Sign in client-side so the dashboard layout's getUser() finds a session
        try {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          await supabase.auth.signInWithPassword({
            email: creds.email,
            password: creds.password,
          });
        } catch {
          // If sign-in fails the user can sign in manually from /login
        }

        setShowCelebration(true);
      });
    },
    [startTransition],
  );

  // ─── Render ───
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-background/95">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-5 lg:h-16 lg:px-8">
        <div className="flex items-center gap-2">
          {!isFirst && step !== "provisioning" && !(isHosted && step === "provider") && (
            <button
              type="button"
              onClick={goBack}
              aria-label="Go back"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <HqLogo size={24} className="text-foreground" />
        </div>
        <div className="hidden md:flex flex-1 justify-center px-8">
          <WizardProgress steps={progressSteps} currentStep={progressStep} />
        </div>
        <div className="flex items-center gap-3">
          <kbd className="hidden lg:inline-block rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
            Enter ↵
          </kbd>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <LogOut className="h-3 w-3" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
        <div className="md:hidden">
          <WizardProgress steps={progressSteps} currentStep={progressStep} />
        </div>
      </header>

      {/* Content */}
      <main
        className={cn(
          "flex flex-1 justify-center overflow-y-auto px-5 pb-24 lg:px-8",
          showCelebration
            ? "items-center"
            : layout === "narrow"
              ? "items-center"
              : "items-start",
        )}
      >
        {showCelebration ? (
          <div className="w-full max-w-lg">
            <StepCelebration
              workspaceName={data.workspaceName as string | undefined}
              agentName={data.agentName as string | undefined}
              agentEmoji={data.agentEmoji as string | undefined}
              needsManualLogin={needsManualLogin}
              onContinue={needsManualLogin ? () => window.location.assign("/auth") : navigateToTasks}
            />
          </div>
        ) : (
          <div
            className={cn(
              layout === "narrow"
                ? "w-full max-w-lg"
                : "w-full max-w-3xl",
              layout === "wide" && "pt-8",
            )}
          >
            {error && (
              <div className="mb-5 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive animate-in fade-in duration-200">
                <span className="flex-1">{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="shrink-0 p-0.5 rounded text-destructive/60 hover:text-destructive transition-colors"
                  aria-label="Dismiss error"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <div
              key={step}
              className={cn(
                "animate-in fade-in duration-300",
                direction === "forward"
                  ? "slide-in-from-right-4"
                  : "slide-in-from-left-4",
              )}
            >
              {step === "welcome" && (
                <StepWelcome
                  initialName={data.ownerName}
                  subtitle={
                    isHosted
                      ? "Set up your workspace in a few quick steps."
                      : "Set up your workspace in a few steps. Takes about 10 minutes."
                  }
                  onSubmit={handleWelcome}
                  pending={pending}
                />
              )}

              {step === "intent" && (
                <StepIntent
                  ownerName={data.ownerName ?? ""}
                  initialKey={data.intentKey}
                  onSubmit={handleIntent}
                  pending={pending}
                />
              )}

              {step === "infrastructure" && (
                <StepInfrastructure
                  status={infraStatus}
                  schemaInstall={schemaInstall}
                  onValidateDb={handleValidateDb}
                  onRunOneClick={handleRunOneClick}
                  onConfirmSchema={handleConfirmSchema}
                  onChooseGateway={handleChooseGateway}
                  onContinue={handleInfraContinue}
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
                  isHosted={isHosted}
                />
              )}

              {step === "agent" && (
                <StepAgent
                  recommendation={getRecommendation()}
                  onCreateAgent={handleCreateAgent}
                  provisionStatus={provisionStatus}
                  provisionError={provisionError}
                  pending={pending}
                />
              )}

              {step === "account" && (
                <StepAccount
                  ownerName={data.preferredName ?? data.ownerName}
                  onSubmit={handleAccount}
                  pending={pending}
                  error={accountError}
                />
              )}

              {step === "payment" && (
                <StepPayment
                  ownerName={(data.ownerName as string) ?? ""}
                  workspaceLabel={(data.workspaceName as string) ?? "My Workspace"}
                  intentKey={(data.intentKey as string) ?? "other"}
                  email={hostedEmail}
                  onCheckout={handlePaymentCheckout}
                  pending={pending}
                />
              )}

              {step === "provisioning" && (
                <StepProvisioning
                  workspaceId={hostedWorkspaceId || (data.hostedWorkspaceId as string) || ""}
                  onComplete={handleProvisionComplete}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

