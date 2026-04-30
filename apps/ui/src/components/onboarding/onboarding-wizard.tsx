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
  saveTailscaleAuthKey,
  resetGatewayPlacement,
  resetSupabaseConnection,
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
import { StepRail, StepRailMobile, type StepRailItem } from "./step-rail";
import { useWizardNavigation } from "./use-wizard-navigation";

export interface WizardInitialState {
  step: OnboardingStep;
  data: Record<string, unknown>;
}

// Canonical ordering. The rail surfaces all of these except `done`
// (the completion screen has no preceding navigation).
const STEP_ORDER: OnboardingStep[] = [
  "welcome",
  "workspace",
  "context",
  "supabase",
  "account",
  "gateway",
  "done",
];

// Human labels for the rail (kept separate from the internal step ids
// so we can rename one without touching the other). Only the live steps
// have entries — legacy step values in `OnboardingStep` are mapped to
// these via `coerceStep` before they ever reach the rail.
const STEP_META: Partial<
  Record<OnboardingStep, { label: string; hint?: string }>
> = {
  welcome: { label: "Welcome", hint: "About you" },
  workspace: { label: "Workspace", hint: "Name your HQ" },
  context: { label: "Your work", hint: "What you'll use it for" },
  supabase: { label: "Database", hint: "Connect Supabase" },
  account: { label: "Account", hint: "Sign-in credentials" },
  gateway: { label: "Gateway", hint: "Where agents run" },
  done: { label: "Done" },
};

// Map legacy step values from earlier builds to the closest current
// step. Without this, a user who completed Supabase + Account before we
// removed the Networking step would land on `networking` (or `placement`
// or `pipeline` etc.), which no longer renders, and end up stuck.
function coerceStep(stored: OnboardingStep): OnboardingStep {
  switch (stored) {
    case "networking":
    case "placement":
      return "gateway";
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

  const [data, setData] = useState<Record<string, unknown>>(initial.data);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gateway, setGateway] = useState<GatewayBootstrap | null>(null);
  const [localStartError, setLocalStartError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sub-phase Back handlers. Each returns true if it consumed the Back
  // press (so global Back doesn't retreat further). The Gateway handler
  // unwinds boot → tailscale → placement-picker without leaving the step.
  const subPhaseBack: Partial<Record<OnboardingStep, () => boolean>> = {
    gateway: () => {
      const inBoot =
        Boolean(gateway) || data.tailscaleAuthKey !== undefined;
      if (!inBoot) return false; // already on placement picker
      // Reset gateway sub-state without leaving the step.
      setGateway(null);
      setLocalStartError(null);
      patch({ tailscaleAuthKey: undefined, placement: undefined });
      void resetGatewayPlacement();
      return true;
    },
  };

  const nav = useWizardNavigation<OnboardingStep>({
    steps: STEP_ORDER,
    initial: initialStep,
    subPhaseBack,
  });
  const { step, direction, completed, goBack, jumpTo, go, truncateCompleted } =
    nav;

  // Placement lives inside data — set when the user clicks a tile on
  // the first phase of the Gateway step.
  const placement = (data.placement as "local" | "remote" | undefined) ?? null;

  const patch = useCallback(
    (updates: Record<string, unknown>) =>
      setData((prev) => ({ ...prev, ...updates })),
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
      go("workspace");
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

  const submitPlacement = (chosen: "local" | "remote") => {
    startTransition(async () => {
      const r = await saveGatewaySetup({ placement: chosen });
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      patch({ placement: chosen });
    });
  };

  // ─── Gateway provisioning effects ───
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
      const tsKey = data.tailscaleAuthKey;
      if (tsKey === undefined) return;
      if (gateway?.token) return;
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
    if (!gateway) return;
    // Note: poll continues even if user navigates away — that's
    // intentional. Background-busy state surfaces in the rail.
    const interval = setInterval(async () => {
      if (placement === "local") {
        const r = await pollLocalGateway();
        if (r.status === "ready") {
          setGateway((g) => (g ? { ...g, gatewayOnline: true, gatewayId: r.gatewayId } : g));
        }
      } else if (placement === "remote" && gateway.tokenId) {
        const r = await pollRemoteGatewayToken(gateway.tokenId);
        if (r.status === "ready") {
          setGateway((g) =>
            g ? { ...g, gatewayOnline: true, gatewayId: r.gatewayId } : g,
          );
        } else if (r.status === "expired") {
          setGateway((g) => (g ? { ...g, token: undefined } : g));
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [gateway, placement]);

  const advanceFromGateway = () => {
    startTransition(async () => {
      const r = await advanceAfterGateway();
      if (!r.ok) return setError(r.error ?? "Couldn't advance");
      go("done");
    });
  };

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

  // ─── Keyboard shortcut: Cmd/Ctrl+← for Back ───
  // Skip when the user is in an input/textarea (Cmd+← is the native
  // "jump to start of line" shortcut there). Also no-op on welcome
  // since there's nowhere to go back to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (step === "done" || step === "welcome") return;
      if (!((e.metaKey || e.ctrlKey) && e.key === "ArrowLeft")) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, goBack]);

  // ─── Build rail items ───
  const railItems: StepRailItem[] = STEP_ORDER.filter(
    (s) => s !== "done",
  ).map((s) => {
    const meta = STEP_META[s] ?? { label: s };
    const status: StepRailItem["status"] =
      s === step ? "current" : completed.has(s) ? "done" : "future";
    // Surface "gateway is busy in the background" if the user has
    // navigated away while a gateway operation continues. Today, the
    // only background work is polling for online — once the user has
    // moved on we treat it as done. Reserved for future expansion.
    const busy = false;
    return {
      id: s,
      label: meta.label,
      hint: meta.hint,
      status,
      busy,
    };
  });

  // Done screen takes over the entire viewport (no rail).
  if (step === "done") {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-background/95">
        <main className="flex flex-1 items-start justify-center overflow-y-auto px-6 pb-24">
          <div className="w-full max-w-xl pt-8">
            <StepDone
              workspaceName={
                (data.workspaceName as string) ??
                (data.workspaceLabel as string) ??
                "Workspace"
              }
              workspaceEmoji={(data.workspaceEmoji as string) ?? "🏠"}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-screen bg-gradient-to-b from-background to-background/95"
    >
      <StepRail items={railItems} onJump={(id) => jumpTo(id as OnboardingStep)} />

      <div className="flex flex-1 flex-col">
        {/* Top bar: mobile pill + back button + brand */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/40 px-5 lg:px-8">
          <div className="flex items-center gap-3">
            {step !== "welcome" && (
              <button
                type="button"
                onClick={goBack}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                aria-label="Back"
              >
                <ArrowLeft className="h-3 w-3" />
                <span className="hidden sm:inline">Back</span>
                <kbd className="hidden rounded bg-muted/60 px-1 py-0.5 text-[9px] font-medium text-muted-foreground/70 sm:inline">
                  ⌘←
                </kbd>
              </button>
            )}
          </div>

          {/* Mobile-only step pill — drawer for navigating between
              steps when the rail is hidden. */}
          <StepRailMobile
            items={railItems}
            onJump={(id) => jumpTo(id as OnboardingStep)}
          />

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-semibold tracking-tight text-foreground lg:hidden">
              HQ
            </span>
          </div>
        </header>

        <main className="flex flex-1 items-start justify-center overflow-y-auto px-5 pb-24 lg:px-8">
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
                  existing={
                    data.supabaseUrl && data.projectId
                      ? {
                          url: data.supabaseUrl as string,
                          projectId: data.projectId as string,
                          workspaceLabel:
                            (data.workspaceLabel as string) ?? "Workspace",
                          workspaceEmoji:
                            (data.workspaceEmoji as string) ?? "🏠",
                        }
                      : null
                  }
                  onContinueExisting={() => go("account")}
                  onResetCredentials={() => {
                    // Clear downstream state so the user is forced to
                    // re-Account and re-Gateway against the new project.
                    setGateway(null);
                    setLocalStartError(null);
                    patch({
                      supabaseUrl: undefined,
                      supabaseAnonKey: undefined,
                      projectId: undefined,
                      authEmail: undefined,
                      authMode: undefined,
                      placement: undefined,
                      tailscaleAuthKey: undefined,
                    });
                    // Roll back the rail's "completed" set so Account
                    // and Gateway re-render as future steps until the
                    // user redoes them.
                    truncateCompleted("supabase");
                    void resetSupabaseConnection();
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
                  onSignOut={() => {
                    // User clicked "Use a different account." Roll the
                    // rail back so Account + Gateway show as needing
                    // to be redone.
                    truncateCompleted("account");
                    patch({ authEmail: undefined, authMode: undefined });
                  }}
                />
              )}

              {step === "gateway" && (
                <StepGateway
                  placement={placement}
                  bootstrap={gateway}
                  localError={localStartError}
                  onChoosePlacement={submitPlacement}
                  onProvideTailscaleKey={(key) => {
                    // Persist server-side so a refresh resumes here
                    // with the key intact. Don't block the UI on the
                    // network round-trip — it's safe to render the boot
                    // phase immediately while the save flushes.
                    patch({ tailscaleAuthKey: key });
                    void saveTailscaleAuthKey({ tailscaleAuthKey: key });
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
                  onChangePlacement={() => {
                    // Reset gateway sub-state so the placement picker
                    // re-renders. Same teardown the sub-phase Back
                    // handler does, but exposed as an explicit affordance.
                    setGateway(null);
                    setLocalStartError(null);
                    patch({
                      tailscaleAuthKey: undefined,
                      placement: undefined,
                    });
                    // Persist the reset so a refresh doesn't bring the
                    // user back to the boot phase against the old choice.
                    void resetGatewayPlacement();
                  }}
                  pending={pending}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
