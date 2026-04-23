"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveWelcome,
  saveContext,
  savePlacement,
  getNetworkingStatus,
  saveNetworking,
  startLocalGatewayAction,
  mintGatewayTokenAction,
  pollLocalGateway,
  pollRemoteGatewayToken,
  advanceAfterGateway,
  saveWorkspaceStep,
  finalizeOnboarding,
  type OnboardingStep,
  type NetworkingStatus,
  type GatewayBootstrap,
} from "@/app/onboarding/actions";
import { StepWelcome } from "./steps/step-welcome";
import { StepContext } from "./steps/step-context";
import { StepPlacement } from "./steps/step-placement";
import { StepSupabase } from "./steps/step-supabase";
import { StepNetworking } from "./steps/step-networking";
import { StepGateway } from "./steps/step-gateway";
import { StepWorkspace } from "./steps/step-workspace";
import { StepDone } from "./steps/step-done";

export interface WizardInitialState {
  step: OnboardingStep;
  data: Record<string, unknown>;
}

// Canonical ordering. The side-nav / progress bar only shows these;
// legacy enum values (pipeline/fields/streams/first_agent/profile) are
// quietly skipped if present in old persisted state.
const STEP_ORDER: OnboardingStep[] = [
  "welcome",
  "context",
  "placement",
  "supabase",
  "networking",
  "gateway",
  "workspace",
  "done",
];

const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  context: "Context",
  placement: "Where agents run",
  supabase: "Supabase",
  networking: "Networking",
  gateway: "Gateway",
  workspace: "Workspace",
  done: "Done",
  // Legacy — not shown in the nav:
  profile: "",
  pipeline: "",
  fields: "",
  streams: "",
  first_agent: "",
};

export function OnboardingWizard({ initial }: { initial: WizardInitialState }) {
  // Coerce any legacy step values to the nearest current step so users
  // resuming from an older persisted state don't get stuck.
  const initialStep = STEP_ORDER.includes(initial.step)
    ? initial.step
    : "workspace";

  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [data, setData] = useState<Record<string, unknown>>(initial.data);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [netStatus, setNetStatus] = useState<NetworkingStatus | null>(null);
  const [gateway, setGateway] = useState<GatewayBootstrap | null>(null);
  const [localStartError, setLocalStartError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const placement = (data.placement as "local" | "remote" | undefined) ?? null;
  const visibleSteps = STEP_ORDER;
  const stepIndex = visibleSteps.indexOf(step);

  const patch = useCallback(
    (updates: Record<string, unknown>) =>
      setData((prev) => ({ ...prev, ...updates })),
    [],
  );

  const go = useCallback(
    (next: OnboardingStep, dir: "forward" | "back" = "forward") => {
      setDirection(dir);
      setError(null);
      setStep(next);
    },
    [],
  );

  // ─── Welcome ───
  const submitWelcome = (vals: {
    ownerName: string;
    preferredName?: string;
    emoji: string;
  }) => {
    startTransition(async () => {
      const r = await saveWelcome(vals);
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      patch(vals);
      go("context");
    });
  };

  // ─── Context ───
  const submitContext = (presetKey: string) => {
    startTransition(async () => {
      const r = await saveContext({ presetKey });
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      patch({ contextPresetKey: presetKey });
      go("placement");
    });
  };

  // ─── Placement ───
  const submitPlacement = (placement: "local" | "remote") => {
    startTransition(async () => {
      const r = await savePlacement({ placement });
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      patch({ placement });
      go("supabase");
    });
  };

  // ─── Supabase (self-contained sub-stepper) ───
  const handleSupabaseComplete = (result: {
    workspaceLabel: string;
    workspaceEmoji: string;
    url: string;
    authEmail?: string;
    projectId: string;
  }) => {
    patch({
      workspaceLabel: result.workspaceLabel,
      workspaceEmoji: result.workspaceEmoji,
      supabaseUrl: result.url,
      authEmail: result.authEmail,
      projectId: result.projectId,
    });
    go("networking");
  };

  // ─── Networking ───
  useEffect(() => {
    if (step !== "networking") return;
    let alive = true;
    (async () => {
      const s = await getNetworkingStatus();
      if (alive) setNetStatus(s);
    })();
    return () => {
      alive = false;
    };
  }, [step]);

  const submitNetworking = (useTailscale: boolean) => {
    startTransition(async () => {
      const r = await saveNetworking({ useTailscale });
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      patch({ useTailscale });
      go("gateway");
    });
  };

  // ─── Gateway ───
  useEffect(() => {
    if (step !== "gateway") return;
    if (placement === "local") {
      startTransition(async () => {
        const started = await startLocalGatewayAction();
        if (started.ok && started.data) {
          setGateway(started.data);
          setLocalStartError(null);
        } else {
          setGateway({ placement: "local", dockerAvailable: false });
          setLocalStartError(started.error ?? "Docker unreachable");
        }
      });
    } else if (placement === "remote" && !gateway?.token) {
      startTransition(async () => {
        const minted = await mintGatewayTokenAction({
          label: (data.gatewayName as string | undefined) ?? "Gateway",
        });
        if (minted.ok && minted.data) setGateway(minted.data);
        else setError(minted.error ?? "Couldn't generate registration token");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, placement]);

  useEffect(() => {
    if (step !== "gateway" || !gateway) return;
    const interval = setInterval(async () => {
      if (placement === "local") {
        const r = await pollLocalGateway();
        if (r.status === "online") {
          setGateway((g) => (g ? { ...g, gatewayOnline: true } : g));
        }
      } else if (placement === "remote" && gateway.tokenId) {
        const r = await pollRemoteGatewayToken(gateway.tokenId);
        if (r.status === "online") {
          setGateway((g) =>
            g ? { ...g, gatewayOnline: true, gatewayId: r.gatewayId } : g,
          );
        } else if (r.status === "expired") {
          setGateway((g) => (g ? { ...g, token: undefined } : g));
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [step, gateway, placement]);

  const advanceFromGateway = () => {
    startTransition(async () => {
      const r = await advanceAfterGateway();
      if (!r.ok) return setError(r.error ?? "Couldn't advance");
      go("workspace");
    });
  };

  // ─── Workspace → Done (finalize in one step) ───
  const submitWorkspace = (vals: {
    name: string;
    slug: string;
    description: string;
  }) => {
    startTransition(async () => {
      const r = await saveWorkspaceStep({
        name: vals.name,
        slug: vals.slug,
        description: vals.description,
      });
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      patch({
        workspaceName: vals.name,
        workspaceSlug: vals.slug,
        workspaceDescription: vals.description,
      });
      const fin = await finalizeOnboarding();
      if (!fin.ok) {
        setError(fin.error ?? "Couldn't finalize");
        return;
      }
      go("done");
    });
  };

  const goBack = () => {
    if (stepIndex <= 0) return;
    go(visibleSteps[stepIndex - 1], "back");
  };

  return (
    <div
      ref={containerRef}
      className="flex min-h-screen flex-col bg-gradient-to-b from-background to-background/95"
    >
      {/* Top bar — minimal: back button, progress indicator, brand tag */}
      <header className="flex h-14 shrink-0 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          {stepIndex > 0 && step !== "done" && (
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
          )}
        </div>

        {step !== "done" && (
          <ProgressDots
            steps={visibleSteps.filter((s) => s !== "done")}
            current={step}
          />
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-semibold tracking-tight text-foreground">HQ</span>
        </div>
      </header>

      {/* Main content — generously padded, max-width for legibility */}
      <main className="flex flex-1 items-start justify-center overflow-y-auto px-6 pb-24">
        <div className="w-full max-w-xl pt-8">
          <div
            key={step}
            className={cn(
              "animate-in fade-in duration-300",
              direction === "forward"
                ? "slide-in-from-bottom-2"
                : "slide-in-from-top-2",
            )}
          >
            {error && (
              <div className="mb-5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            )}

            {step === "welcome" && (
              <StepWelcome
                initialName={(data.ownerName as string) ?? ""}
                initialEmoji={(data.ownerEmoji as string) ?? "👋"}
                onSubmit={submitWelcome}
                pending={pending}
              />
            )}

            {step === "context" && (
              <StepContext
                ownerName={(data.ownerName as string) ?? ""}
                initialKey={(data.contextPresetKey as string) ?? null}
                onSubmit={submitContext}
                pending={pending}
              />
            )}

            {step === "placement" && (
              <StepPlacement
                ownerName={(data.ownerName as string) ?? ""}
                onSubmit={submitPlacement}
                pending={pending}
              />
            )}

            {step === "supabase" && (
              <StepSupabase
                defaults={{
                  workspaceLabel:
                    (data.workspaceLabel as string) ??
                    (((data.preferredName as string) ?? "").trim()
                      ? `${(data.preferredName as string).trim()}'s workspace`
                      : "My workspace"),
                  workspaceEmoji: (data.workspaceEmoji as string) ?? "🏠",
                  authEmail: (data.authEmail as string) ?? "",
                }}
                onComplete={handleSupabaseComplete}
              />
            )}

            {step === "networking" && (
              <StepNetworking
                placement={placement ?? "local"}
                status={netStatus}
                onSubmit={submitNetworking}
                onRefresh={async () => {
                  const s = await getNetworkingStatus();
                  setNetStatus(s);
                }}
                pending={pending}
              />
            )}

            {step === "gateway" && (
              <StepGateway
                placement={placement ?? "local"}
                bootstrap={gateway}
                localError={localStartError}
                onContinue={advanceFromGateway}
                onRegenerateToken={() => {
                  startTransition(async () => {
                    const r = await mintGatewayTokenAction({
                      label:
                        (data.gatewayName as string | undefined) ?? "Gateway",
                    });
                    if (r.ok && r.data) setGateway(r.data);
                  });
                }}
                pending={pending}
              />
            )}

            {step === "workspace" && (
              <StepWorkspace
                defaults={{
                  name:
                    (data.workspaceName as string) ??
                    (data.workspaceLabel as string) ??
                    (((data.preferredName as string) ?? "").trim()
                      ? `${(data.preferredName as string).trim()}'s workspace`
                      : "My workspace"),
                  slug: (data.workspaceSlug as string) ?? "",
                  description: (data.workspaceDescription as string) ?? "",
                }}
                onSubmit={submitWorkspace}
                pending={pending}
              />
            )}

            {step === "done" && (
              <StepDone
                workspaceName={
                  (data.workspaceName as string) ??
                  (data.workspaceLabel as string) ??
                  "Workspace"
                }
                workspaceEmoji={(data.workspaceEmoji as string) ?? "🏠"}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Progress dots (Typeform/Linear-style minimal indicator) ────────────

function ProgressDots({
  steps,
  current,
}: {
  steps: OnboardingStep[];
  current: OnboardingStep;
}) {
  const currentIdx = steps.indexOf(current);
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const active = i === currentIdx;
        const done = i < currentIdx;
        return (
          <div
            key={s}
            className={cn(
              "h-1 rounded-full transition-all duration-300",
              active
                ? "w-6 bg-foreground"
                : done
                  ? "w-1 bg-foreground/60"
                  : "w-1 bg-muted-foreground/20",
            )}
          />
        );
      })}
    </div>
  );
}
