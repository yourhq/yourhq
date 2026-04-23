"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveWelcome,
  savePlacement,
  connectAndProvision,
  getNetworkingStatus,
  saveNetworking,
  startLocalGatewayAction,
  mintGatewayTokenAction,
  pollLocalGateway,
  pollRemoteGatewayToken,
  advanceAfterGateway,
  saveWorkspaceStep,
  savePipelineStep,
  saveFieldsStep,
  saveStreamsStep,
  finalizeOnboarding,
  type OnboardingStep,
  type NetworkingStatus,
  type GatewayBootstrap,
} from "@/app/onboarding/actions";
import { StepWelcome } from "./steps/step-welcome";
import { StepPlacement } from "./steps/step-placement";
import { StepSupabase } from "./steps/step-supabase";
import { StepNetworking } from "./steps/step-networking";
import { StepGateway } from "./steps/step-gateway";
import { StepWorkspace } from "@/components/setup/steps/step-workspace";
import { StepPipeline } from "@/components/setup/steps/step-pipeline";
import { StepFields } from "@/components/setup/steps/step-fields";
import { StepStreams } from "@/components/setup/steps/step-streams";
import { StepDone } from "@/components/setup/steps/step-done";
import { DEFAULT_STREAMS } from "@/lib/setup/templates";

export interface WizardInitialState {
  step: OnboardingStep;
  data: Record<string, unknown>;
}

// Step ordering — the nav shows all visible steps in this order. Some
// steps are only shown when the user picked "remote gateway" (and even
// then the networking screen explains why Tailscale is required vs
// optional).
const STEP_ORDER: OnboardingStep[] = [
  "welcome",
  "placement",
  "supabase",
  "networking",
  "gateway",
  "workspace",
  "pipeline",
  "fields",
  "streams",
  "done",
];

const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  placement: "Where agents run",
  supabase: "Supabase",
  networking: "Networking",
  gateway: "Gateway",
  workspace: "Workspace",
  profile: "Profile",
  pipeline: "Pipeline",
  fields: "Fields",
  streams: "Streams",
  first_agent: "First agent",
  done: "Done",
};

// Steps that shouldn't appear in the side nav (internal / transitional).
const HIDDEN_FROM_NAV = new Set<OnboardingStep>(["first_agent", "profile"]);

export function OnboardingWizard({ initial }: { initial: WizardInitialState }) {
  const [step, setStep] = useState<OnboardingStep>(initial.step);
  const [data, setData] = useState<Record<string, unknown>>(initial.data);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sqlFallback, setSqlFallback] = useState<string | null>(null);
  const [netStatus, setNetStatus] = useState<NetworkingStatus | null>(null);
  const [gateway, setGateway] = useState<GatewayBootstrap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const placement = (data.placement as "local" | "remote" | undefined) ?? null;
  const visibleSteps = STEP_ORDER.filter((s) => !HIDDEN_FROM_NAV.has(s));
  const stepIndex = visibleSteps.indexOf(step);

  const patch = useCallback(
    (updates: Record<string, unknown>) =>
      setData((prev) => ({ ...prev, ...updates })),
    [],
  );

  const go = useCallback((next: OnboardingStep, dir: "forward" | "back" = "forward") => {
    setDirection(dir);
    setError(null);
    setSqlFallback(null);
    setStep(next);
  }, []);

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

  // ─── Supabase ───
  const submitSupabase = (vals: {
    workspaceLabel: string;
    workspaceEmoji: string;
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    authEmail: string;
    authPassword: string;
  }) => {
    startTransition(async () => {
      const r = await connectAndProvision(vals);
      if (!r.ok) {
        setError(r.error ?? "Validation failed");
        if (r.sqlFallback) setSqlFallback(r.sqlFallback);
        return;
      }
      patch({
        workspaceLabel: vals.workspaceLabel,
        workspaceEmoji: vals.workspaceEmoji,
        supabaseUrl: vals.url,
        authEmail: vals.authEmail,
        projectId: r.projectId,
      });
      go("networking");
    });
  };

  // ─── Networking ───
  // Auto-detect Tailscale state whenever we land on this step.
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
  // Local: start compose profile, then poll every 3s.
  // Remote: mint token, show one-liner, poll token consumption every 3s.
  useEffect(() => {
    if (step !== "gateway") return;
    if (placement === "local") {
      startTransition(async () => {
        const started = await startLocalGatewayAction();
        if (started.ok && started.data) setGateway(started.data);
        else setError(started.error ?? "Couldn't start the local gateway");
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

  // ─── Workspace → Pipeline → Fields → Streams → Done ───
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
      go("pipeline");
    });
  };

  const submitPipeline = (pipelineKey: string) => {
    startTransition(async () => {
      const r = await savePipelineStep({ pipelineKey });
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      patch({ pipelineKey });
      go("fields");
    });
  };

  const submitFields = (fieldKey: string) => {
    startTransition(async () => {
      const r = await saveFieldsStep({ fieldKey });
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      patch({ fieldKey });
      go("streams");
    });
  };

  const submitStreams = (streams: string[]) => {
    startTransition(async () => {
      const r = await saveStreamsStep({ streamNames: streams });
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      patch({ streamNames: streams });
      // Run the finalizer, then land on "done".
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
    <div ref={containerRef} className="flex min-h-screen flex-col bg-background">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 flex h-full w-52 flex-col border-r border-border/50 bg-sidebar">
        <div className="flex h-12 items-center gap-2 px-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-foreground/95 to-foreground/80 text-background">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-foreground">
            Set up HQ
          </span>
        </div>

        <nav className="flex-1 px-2 pt-2">
          <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Steps
          </div>
          <div className="space-y-0.5">
            {visibleSteps
              .filter((s) => s !== "done")
              .map((s, i) => {
                const isActive = s === step;
                const isComplete = i < stepIndex;
                return (
                  <div
                    key={s}
                    className={cn(
                      "relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
                      isActive
                        ? "bg-accent text-foreground font-medium"
                        : isComplete
                          ? "text-muted-foreground"
                          : "text-muted-foreground/50",
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-foreground" />
                    )}
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-medium",
                        isActive
                          ? "bg-foreground text-background"
                          : isComplete
                            ? "bg-muted text-muted-foreground"
                            : "bg-transparent text-muted-foreground/40",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span>{STEP_LABELS[s]}</span>
                  </div>
                );
              })}
          </div>
        </nav>

        <div className="border-t border-border/50 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <kbd className="rounded border border-border/50 bg-muted/30 px-1 py-px font-mono text-[10px]">
              Enter
            </kbd>
            <span>to continue</span>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="ml-52 flex flex-1 flex-col">
        {step !== "done" && (
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 px-6">
            <div className="w-16">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back
                </button>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground/50">
              {stepIndex + 1} / {visibleSteps.length - 1}
            </span>
            <div className="w-16" />
          </div>
        )}

        <div className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-10">
          <div className="w-full max-w-xl">
            <div
              key={step}
              className={cn(
                "animate-in fade-in duration-150",
                direction === "forward"
                  ? "slide-in-from-right-1"
                  : "slide-in-from-left-1",
              )}
            >
              {error && (
                <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
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
                  onSubmit={submitSupabase}
                  pending={pending}
                  sqlFallback={sqlFallback}
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
                  name={(data.workspaceName as string) ?? ""}
                  slug={(data.workspaceSlug as string) ?? ""}
                  slugTouched={Boolean(data.workspaceSlug)}
                  description={(data.workspaceDescription as string) ?? ""}
                  onChange={(u) => patch(u)}
                />
              )}
              {step === "workspace" && (
                <WizardFooter
                  disabled={
                    !(((data.workspaceName as string) ?? "").trim().length > 0)
                  }
                  pending={pending}
                  onContinue={() =>
                    submitWorkspace({
                      name: (data.workspaceName as string) ?? "",
                      slug: (data.workspaceSlug as string) ?? "",
                      description:
                        (data.workspaceDescription as string) ?? "",
                    })
                  }
                />
              )}

              {step === "pipeline" && (
                <>
                  <StepPipeline
                    selectedKey={(data.pipelineKey as string) ?? "outreach"}
                    onSelect={(key) => patch({ pipelineKey: key })}
                  />
                  <WizardFooter
                    pending={pending}
                    onContinue={() =>
                      submitPipeline(
                        (data.pipelineKey as string) ?? "outreach",
                      )
                    }
                  />
                </>
              )}

              {step === "fields" && (
                <>
                  <StepFields
                    selectedKey={(data.fieldKey as string) ?? "creator-outreach"}
                    onSelect={(key) => patch({ fieldKey: key })}
                  />
                  <WizardFooter
                    pending={pending}
                    onContinue={() =>
                      submitFields(
                        (data.fieldKey as string) ?? "creator-outreach",
                      )
                    }
                  />
                </>
              )}

              {step === "streams" && (
                <>
                  <StepStreams
                    streams={
                      (data.streamsList as {
                        name: string;
                        enabled: boolean;
                        isCustom: boolean;
                      }[] | undefined) ??
                      DEFAULT_STREAMS.map((s) => ({
                        name: s.name,
                        enabled: true,
                        isCustom: false,
                      }))
                    }
                    onChange={(streamsList) => patch({ streamsList })}
                  />
                  <WizardFooter
                    pending={pending}
                    onContinue={() =>
                      submitStreams(
                        ((data.streamsList as {
                          name: string;
                          enabled: boolean;
                        }[] | undefined) ??
                          DEFAULT_STREAMS.map((s) => ({
                            name: s.name,
                            enabled: true,
                          })))
                          .filter((s) => s.enabled)
                          .map((s) => s.name),
                      )
                    }
                  />
                </>
              )}

              {step === "done" && (
                <StepDone
                  submitting={false}
                  submitted={true}
                  error={null}
                  workspaceName={(data.workspaceName as string) ?? "Workspace"}
                  stageCount={0}
                  fieldCount={0}
                  streamCount={
                    ((data.streamNames as string[] | undefined) ?? []).length
                  }
                  onGoToDashboard={() => {
                    window.location.href = "/dashboard";
                  }}
                  onRetry={() => {}}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WizardFooter({
  disabled,
  pending,
  onContinue,
}: {
  disabled?: boolean;
  pending: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="mt-6 flex justify-end">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={onContinue}
        className={cn(
          "rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors",
          disabled || pending
            ? "text-muted-foreground/30 cursor-not-allowed"
            : "bg-foreground text-background hover:bg-foreground/90",
        )}
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </div>
  );
}
