"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { completeSetup } from "@/app/setup/actions";
import { PIPELINE_TEMPLATES, FIELD_TEMPLATES, DEFAULT_STREAMS } from "@/lib/setup/templates";
import { StepWorkspace } from "./steps/step-workspace";
import { StepProfile } from "./steps/step-profile";
import { StepPipeline } from "./steps/step-pipeline";
import { StepFields } from "./steps/step-fields";
import { StepStreams } from "./steps/step-streams";
import { StepDone } from "./steps/step-done";

export type SetupStep =
  | "workspace"
  | "profile"
  | "pipeline"
  | "fields"
  | "streams"
  | "done";

const STEPS: SetupStep[] = [
  "workspace",
  "profile",
  "pipeline",
  "fields",
  "streams",
  "done",
];

export interface WizardState {
  name: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  ownerName: string;
  preferredName: string;
  timezone: string;
  pipelineKey: string;
  fieldKey: string;
  streams: { name: string; enabled: boolean; isCustom: boolean }[];
}

const INITIAL_STATE: WizardState = {
  name: "",
  slug: "",
  slugTouched: false,
  description: "",
  ownerName: "",
  preferredName: "",
  timezone: "",
  pipelineKey: "outreach",
  fieldKey: "creator-outreach",
  streams: DEFAULT_STREAMS.map((s) => ({
    name: s.name,
    enabled: true,
    isCustom: false,
  })),
};

export function SetupWizard() {
  const [step, setStep] = useState<SetupStep>("workspace");
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const stepIndex = STEPS.indexOf(step);
  const inputSteps = STEPS.filter((s) => s !== "done");

  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case "workspace":
        return state.name.trim().length > 0;
      case "profile":
        return true;
      case "pipeline":
        return !!PIPELINE_TEMPLATES.find((t) => t.key === state.pipelineKey);
      case "fields":
        return !!FIELD_TEMPLATES.find((t) => t.key === state.fieldKey);
      case "streams":
        return state.streams.some((s) => s.enabled);
      case "done":
        return false;
    }
  }, [step, state]);

  function goNext() {
    if (!canAdvance()) return;
    setDirection("forward");
    setStep(STEPS[stepIndex + 1]);
  }

  function goBack() {
    if (stepIndex <= 0 || step === "done") return;
    setDirection("back");
    setStep(STEPS[stepIndex - 1]);
  }

  useEffect(() => {
    if (step !== "done" || submitted || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    completeSetup({
      name: state.name,
      slug: state.slug,
      description: state.description,
      ownerName: state.ownerName,
      preferredName: state.preferredName,
      timezone: state.timezone,
      pipelineTemplateKey: state.pipelineKey,
      fieldTemplateKey: state.fieldKey,
      streamNames: state.streams.filter((s) => s.enabled).map((s) => s.name),
    })
      .then(() => {
        setSubmitted(true);
        setSubmitting(false);
      })
      .catch((err) => {
        setSubmitError(err?.message ?? "Setup failed");
        setSubmitting(false);
      });
  }, [step, submitted, submitting, state]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (step === "done") return;
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "TEXTAREA") return;
        e.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, state]);

  const patch = useCallback(
    (updates: Partial<WizardState>) =>
      setState((prev) => ({ ...prev, ...updates })),
    []
  );

  const pipelineTemplate = PIPELINE_TEMPLATES.find(
    (t) => t.key === state.pipelineKey
  );
  const fieldTemplate = FIELD_TEMPLATES.find(
    (t) => t.key === state.fieldKey
  );
  const streamCount = state.streams.filter((s) => s.enabled).length;

  return (
    <div ref={containerRef} className="flex min-h-screen flex-col bg-background">
      {/* Sidebar-like left strip with logo + step progress */}
      <div className="fixed left-0 top-0 flex h-full w-52 flex-col border-r border-border/50 bg-sidebar">
        {/* Logo — matches dashboard shell */}
        <div className="flex h-12 items-center gap-2 px-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-foreground/95 to-foreground/80 text-background">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-foreground">
            Setup
          </span>
        </div>

        {/* Step list */}
        <nav className="flex-1 px-2 pt-2">
          <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Steps
          </div>
          <div className="space-y-0.5">
            {inputSteps.map((s, i) => {
              const isActive = s === step;
              const isComplete = i < stepIndex;
              const labels: Record<string, string> = {
                workspace: "Workspace",
                profile: "Profile",
                pipeline: "Pipeline",
                fields: "Fields",
                streams: "Streams",
              };
              return (
                <div
                  key={s}
                  className={cn(
                    "relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
                    isActive
                      ? "bg-accent text-foreground font-medium"
                      : isComplete
                        ? "text-muted-foreground"
                        : "text-muted-foreground/50"
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-foreground" />
                  )}
                  <span className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-medium",
                    isActive
                      ? "bg-foreground text-background"
                      : isComplete
                        ? "bg-muted text-muted-foreground"
                        : "bg-transparent text-muted-foreground/40"
                  )}>
                    {i + 1}
                  </span>
                  <span>{labels[s]}</span>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Bottom hint */}
        <div className="border-t border-border/50 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <kbd className="rounded border border-border/50 bg-muted/30 px-1 py-px font-mono text-[10px]">
              Enter
            </kbd>
            <span>to continue</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-52 flex flex-1 flex-col">
        {/* Top bar with back + continue */}
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
              {stepIndex + 1} / {inputSteps.length}
            </span>
            <div className="flex w-16 justify-end">
              <button
                type="button"
                disabled={!canAdvance()}
                onClick={goNext}
                className={cn(
                  "rounded-md px-3 py-1 text-[13px] font-medium transition-colors",
                  canAdvance()
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "text-muted-foreground/30 cursor-not-allowed"
                )}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step content */}
        <div className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-10">
          <div className="w-full max-w-lg">
            <div
              key={step}
              className={cn(
                "animate-in fade-in duration-150",
                direction === "forward"
                  ? "slide-in-from-right-1"
                  : "slide-in-from-left-1"
              )}
            >
              {step === "workspace" && (
                <StepWorkspace
                  name={state.name}
                  slug={state.slug}
                  slugTouched={state.slugTouched}
                  description={state.description}
                  onChange={patch}
                />
              )}
              {step === "profile" && (
                <StepProfile
                  ownerName={state.ownerName}
                  preferredName={state.preferredName}
                  timezone={state.timezone}
                  onChange={patch}
                />
              )}
              {step === "pipeline" && (
                <StepPipeline
                  selectedKey={state.pipelineKey}
                  onSelect={(key) => patch({ pipelineKey: key })}
                />
              )}
              {step === "fields" && (
                <StepFields
                  selectedKey={state.fieldKey}
                  onSelect={(key) => patch({ fieldKey: key })}
                />
              )}
              {step === "streams" && (
                <StepStreams
                  streams={state.streams}
                  onChange={(streams) => patch({ streams })}
                />
              )}
              {step === "done" && (
                <StepDone
                  submitting={submitting}
                  submitted={submitted}
                  error={submitError}
                  workspaceName={state.name}
                  stageCount={pipelineTemplate?.stages.length ?? 0}
                  fieldCount={fieldTemplate?.fields.length ?? 0}
                  streamCount={streamCount}
                  onGoToDashboard={() => {
                    window.location.href = "/dashboard";
                  }}
                  onRetry={() => {
                    setSubmitted(false);
                    setSubmitError(null);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
