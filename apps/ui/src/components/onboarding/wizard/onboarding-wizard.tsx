"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWizardState, clearWizardSession, type WizardData } from "./use-wizard-state";
import { StepWelcome } from "./step-welcome";
import { StepIntent } from "./step-intent";
import { StepInfrastructure, type InfraStatus } from "./step-infrastructure";
import { StepProvider } from "./step-provider";
import { StepAgent, type AgentRecommendation } from "./step-agent";
import { FIRST_TASK_SUGGESTIONS } from "@/lib/onboarding/first-task-suggestions";
import { completeItem } from "@/lib/onboarding/progress";
import {
  saveWelcomeStep,
  saveIntentStep,
  connectProvider,
  createFirstAgent,
  pollAgentProvisionStatus,
  validateAndConnectDb,
  setupGateway,
  advanceInfrastructure,
} from "./actions";

const INTENT_TO_TEMPLATE: Record<string, { branch: string; name: string; emoji: string; role: string; description: string }> = {
  reach: { branch: "template/crm-researcher", name: "Scout", emoji: "🦅", role: "Research & Outreach", description: "Researches people, verifies info, and helps you craft personalized outreach." },
  deals: { branch: "template/crm-researcher", name: "Scout", emoji: "🦅", role: "Sales Research", description: "Finds decision-makers, researches companies, and preps you for every conversation." },
  hire: { branch: "template/crm-researcher", name: "Scout", emoji: "🦅", role: "Talent Sourcing", description: "Sources candidates, screens profiles, and helps you build a strong pipeline." },
  publish: { branch: "template/ghostwriter", name: "Ghost", emoji: "🦎", role: "Content Writer", description: "Writes in your voice across any format — newsletters, posts, threads, and more." },
  run: { branch: "template/chief-of-staff", name: "Chief", emoji: "🦫", role: "Operations", description: "Coordinates tasks, tracks clients, and keeps everything moving forward." },
  explore: { branch: "template/assistant", name: "Assistant", emoji: "🐕", role: "General Assistant", description: "Routes work, tracks moving parts, and helps you stay organized." },
};

export interface OnboardingWizardProps {
  isHosted: boolean;
  initialData?: WizardData;
}

export function OnboardingWizard({ isHosted, initialData }: OnboardingWizardProps) {
  const router = useRouter();
  const {
    step,
    data,
    patch,
    advance,
    goBack,
    pending,
    startTransition,
    error,
    setError,
    isFirst,
  } = useWizardState({ isHosted, initialData });

  // Infrastructure state (OSS only)
  const [infraStatus, setInfraStatus] = useState<InfraStatus>({
    db: "idle",
    gateway: "idle",
  });

  // Provider state
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Agent provisioning state
  const [provisionStatus, setProvisionStatus] = useState<"idle" | "provisioning" | "ready" | "error">("idle");
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
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
      startTransition(async () => {
        const r = await validateAndConnectDb({ url, anonKey, serviceRoleKey });
        if (r.ok) {
          setInfraStatus((s) => ({ ...s, db: "connected" }));
          patch({ supabaseUrl: url, supabaseAnonKey: anonKey });
        } else {
          setInfraStatus((s) => ({ ...s, db: "error", dbError: r.error }));
        }
      });
    },
    [startTransition, patch],
  );

  const handleChooseGateway = useCallback(
    (placement: "local" | "remote") => {
      setInfraStatus((s) => ({ ...s, gateway: "starting" }));
      startTransition(async () => {
        const r = await setupGateway(placement);
        if (r.ok) {
          setInfraStatus((s) => ({ ...s, gateway: "polling" }));
          patch({ placement });
          // Poll for gateway readiness
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
          }));
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
          // Brief pause to show success state
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
    const intentKey = (data.intentKey as string) ?? "explore";
    const rec = INTENT_TO_TEMPLATE[intentKey] ?? INTENT_TO_TEMPLATE.explore;
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

      // Start polling provision status
      if (provisionCommandId) {
        const interval = setInterval(async () => {
          const status = await pollAgentProvisionStatus(provisionCommandId);
          if (status === "completed") {
            clearInterval(interval);
            setProvisionStatus("ready");
          } else if (status === "error") {
            clearInterval(interval);
            setProvisionStatus("error");
            setProvisionError("Agent provisioning failed");
          }
        }, 3000);
        pollRef.current = interval;
      }

      return { agentId, provisionCommandId };
    },
    [patch, setError],
  );

  const navigateToTasks = useCallback(() => {
    clearWizardSession();

    const progress = localStorage.getItem("hq_onboarding_progress");
    const parsed = progress ? JSON.parse(progress) : {};
    parsed.wizardCompleted = true;
    localStorage.setItem("hq_onboarding_progress", JSON.stringify(parsed));
    window.dispatchEvent(new CustomEvent("hq:onboarding-progress"));

    completeItem("agentCreated");

    const intentKey = (data.intentKey as string) ?? "explore";
    const suggestion = FIRST_TASK_SUGGESTIONS[intentKey];
    const params = new URLSearchParams({ onboarding: "first-task" });
    if (suggestion) params.set("title", suggestion.title);
    if (data.agentId) params.set("agent", data.agentId as string);
    router.push(`/dashboard/tasks?${params.toString()}`);
  }, [data.intentKey, data.agentId, router]);

  const handleSubmitChannel = useCallback(
    (channelData: { agentId: string; channelType: string; token: string }) => {
      patch({ channelType: channelData.channelType, channelToken: channelData.token });
      navigateToTasks();
    },
    [patch, navigateToTasks],
  );

  const handleSkipChannel = useCallback(() => {
    navigateToTasks();
  }, [navigateToTasks]);

  // ─── Render ───
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-background/95">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-5 lg:px-8">
        <div className="flex items-center gap-3">
          {!isFirst && (
            <button
              type="button"
              onClick={goBack}
              aria-label="Go back"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            >
              <ArrowLeft className="h-3 w-3" />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}
        </div>
        <div className="text-[11px] font-semibold tracking-tight text-foreground">
          HQ
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-1 items-start justify-center overflow-y-auto px-5 pb-24 lg:px-8">
        <div className="w-full max-w-xl pt-8">
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
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            {step === "welcome" && (
              <StepWelcome
                initialName={data.ownerName}
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
                onValidateDb={handleValidateDb}
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
              />
            )}

            {step === "agent" && (
              <StepAgent
                recommendation={getRecommendation()}
                onCreateAgent={handleCreateAgent}
                onSubmitChannel={handleSubmitChannel}
                onSkipChannel={handleSkipChannel}
                provisionStatus={provisionStatus}
                provisionError={provisionError}
                pending={pending}
              />
            )}
          </div>
        </div>
      </main>

      {/* Progress dots */}
      <ProgressDots steps={isHosted
        ? ["welcome", "intent", "provider", "agent"]
        : ["welcome", "intent", "infrastructure", "provider", "agent"]
      } current={step} />
    </div>
  );
}

function ProgressDots({ steps, current }: { steps: string[]; current: string }) {
  const currentIdx = steps.indexOf(current);
  return (
    <footer className="flex h-10 items-center justify-center gap-1.5 border-t border-border/20">
      {steps.map((s, i) => (
        <div
          key={s}
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-all",
            s === current
              ? "w-4 bg-foreground"
              : i < currentIdx
                ? "bg-foreground/40"
                : "bg-muted-foreground/20",
          )}
        />
      ))}
    </footer>
  );
}
