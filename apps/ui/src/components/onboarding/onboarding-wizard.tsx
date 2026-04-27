"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveWelcome,
  saveContext,
  startLocalGatewayAction,
  mintGatewayTokenAction,
  pollLocalGateway,
  pollRemoteGatewayToken,
  advanceAfterGateway,
  saveWorkspaceStep,
  saveGatewaySetup,
  type OnboardingStep,
  type GatewayBootstrap,
} from "@/app/onboarding/actions";
import { StepWelcome } from "./steps/step-welcome";
import { StepContext } from "./steps/step-context";
import { StepSupabase } from "./steps/step-supabase";
import { StepAccount } from "./steps/step-account";
import { StepGateway } from "./steps/step-gateway";
import { StepWorkspace } from "./steps/step-workspace";
import { StepDone } from "./steps/step-done";

export interface WizardInitialState {
  step: OnboardingStep;
  data: Record<string, unknown>;
}

// Canonical ordering.
//
// Two clusters of consecutive concerns: data ("your HQ" + Supabase) and
// infrastructure (Gateway). Networking is no longer its own step — it
// surfaces inside the Gateway step (Tailscale auth key only when the
// user picks "remote", since that's when Tailscale is genuinely
// required). For local installs, the entire networking question
// disappears; users discover it later via Settings → Networking when
// they actually want phone/tablet access.
//
// Placement is also folded into the Gateway step's first phase — same
// reasoning, networking-style: it's a property of "where does the
// gateway run," not a standalone decision.
const STEP_ORDER: OnboardingStep[] = [
  "welcome",
  "workspace",
  "context",
  "supabase",
  "account",
  "gateway",
  "done",
];

// Map legacy step values from earlier builds to the closest current
// step. Without this, a user who completed Supabase + Account before we
// removed the Networking step would land on `networking` (or `placement`
// or `pipeline` etc.), which no longer renders, and end up stuck.
function coerceStep(stored: OnboardingStep): OnboardingStep {
  switch (stored) {
    // These all happen *between* Account and the Gateway step in the
    // new flow. Resume from Gateway.
    case "networking":
    case "placement":
      return "gateway";
    // Old wizard had pipeline/fields/streams as separate screens after
    // workspace; the new flow seeds them automatically from the Context
    // tile. If a user landed here mid-flow, the closest current step is
    // Gateway (everything before is captured).
    case "pipeline":
    case "fields":
    case "streams":
    case "first_agent":
    case "profile":
      return "gateway";
    default:
      return STEP_ORDER.includes(stored) ? stored : "welcome";
  }
}

export function OnboardingWizard({ initial }: { initial: WizardInitialState }) {
  const initialStep = coerceStep(initial.step);

  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [data, setData] = useState<Record<string, unknown>>(initial.data);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gateway, setGateway] = useState<GatewayBootstrap | null>(null);
  const [localStartError, setLocalStartError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Placement lives inside data now — set when the user clicks a tile
  // on the first phase of the Gateway step.
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
      go("supabase");
    });
  };

  // ─── Supabase (self-contained sub-stepper) ───
  // Advances to the Account step. We carry url + anonKey + projectId
  // forward so StepAccount can sign in client-side without round-tripping
  // through the server.
  const handleSupabaseComplete = (result: {
    workspaceLabel: string;
    workspaceEmoji: string;
    url: string;
    anonKey: string;
    projectId: string;
  }) => {
    patch({
      workspaceLabel: result.workspaceLabel,
      workspaceEmoji: result.workspaceEmoji,
      supabaseUrl: result.url,
      supabaseAnonKey: result.anonKey,
      projectId: result.projectId,
    });
    go("account");
  };

  const handleAccountComplete = () => {
    go("gateway");
  };

  // Placement is captured at the top of the Gateway step (the user picks
  // local vs remote on a tile). It's a sub-phase of Gateway, not its own
  // step. We persist it into onboarding state so refresh resumes correctly.
  const submitPlacement = (chosen: "local" | "remote") => {
    startTransition(async () => {
      const r = await saveGatewaySetup({ placement: chosen });
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      patch({ placement: chosen });
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
    } else if (placement === "remote") {
      // Only mint the token after the user has either provided a
      // Tailscale auth key or explicitly skipped (data.tailscaleAuthKey
      // is set or empty string). When undefined we're still waiting
      // for them to fill it in on the Tailscale sub-phase.
      const tsKey = data.tailscaleAuthKey;
      if (tsKey === undefined) return;
      if (gateway?.token) return; // already minted
      startTransition(async () => {
        const minted = await mintGatewayTokenAction({
          label: (data.gatewayName as string | undefined) ?? "Gateway",
          tailscaleAuthKey: typeof tsKey === "string" ? tsKey : "",
        });
        if (minted.ok && minted.data) setGateway(minted.data);
        else setError(minted.error ?? "Couldn't generate registration token");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, placement, data.tailscaleAuthKey]);

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

  // After the gateway is online, advanceAfterGateway runs the
  // finalize step server-side (workspace was captured in step 2 already)
  // and we land directly on "done".
  const advanceFromGateway = () => {
    startTransition(async () => {
      const r = await advanceAfterGateway();
      if (!r.ok) return setError(r.error ?? "Couldn't advance");
      go("done");
    });
  };

  // ─── Workspace step (right after Welcome) ───
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
        workspaceLabel: vals.name,
        workspaceSlug: vals.slug,
        workspaceDescription: vals.description,
      });
      go("context");
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

            {step === "context" && (
              <StepContext
                ownerName={(data.ownerName as string) ?? ""}
                initialKey={(data.contextPresetKey as string) ?? null}
                onSubmit={submitContext}
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

            {step === "account" && (
              <StepAccount
                url={(data.supabaseUrl as string) ?? ""}
                anonKey={(data.supabaseAnonKey as string) ?? ""}
                projectId={(data.projectId as string) ?? ""}
                defaultEmail={(data.authEmail as string) ?? ""}
                workspaceLabel={
                  (data.workspaceLabel as string) ?? "Workspace"
                }
                workspaceEmoji={(data.workspaceEmoji as string) ?? "🏠"}
                onComplete={handleAccountComplete}
              />
            )}

            {step === "gateway" && (
              <StepGateway
                placement={placement}
                bootstrap={gateway}
                localError={localStartError}
                onChoosePlacement={submitPlacement}
                onProvideTailscaleKey={(key) => {
                  patch({ tailscaleAuthKey: key });
                }}
                onContinue={advanceFromGateway}
                onRegenerateToken={() => {
                  startTransition(async () => {
                    const r = await mintGatewayTokenAction({
                      label:
                        (data.gatewayName as string | undefined) ?? "Gateway",
                      tailscaleAuthKey:
                        (data.tailscaleAuthKey as string | undefined) ?? "",
                    });
                    if (r.ok && r.data) setGateway(r.data);
                  });
                }}
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
