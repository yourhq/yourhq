"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardProgressProps {
  steps: { key: string; label: string }[];
  currentStep: string;
  subSteps?: number;
  currentSubStep?: number;
}

export function WizardProgress({
  steps,
  currentStep,
  subSteps,
  currentSubStep,
}: WizardProgressProps) {
  const currentIdx = steps.findIndex((s) => s.key === currentStep);
  const progressPercent =
    steps.length > 1 ? Math.round((currentIdx / (steps.length - 1)) * 100) : 0;

  return (
    <>
      {/* Desktop (lg+): full labeled stepper */}
      <div className="hidden lg:flex items-center gap-0">
        {steps.map((s, i) => {
          const completed = i < currentIdx;
          const current = i === currentIdx;
          return (
            <div key={s.key} className="flex items-center">
              {i > 0 && (
                <div
                  className={cn(
                    "h-px w-8 xl:w-12 mx-1",
                    completed
                      ? "bg-foreground/30"
                      : "bg-border/50 border-t border-dashed border-border/50",
                  )}
                />
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-all duration-300",
                    completed &&
                      "bg-green-500 text-white",
                    current &&
                      "bg-foreground text-background ring-2 ring-foreground/20 ring-offset-1 ring-offset-background",
                    !completed &&
                      !current &&
                      "border border-border/60 text-muted-foreground/50",
                  )}
                >
                  {completed ? (
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={cn(
                    "text-[11px] transition-colors",
                    current
                      ? "font-semibold text-foreground"
                      : completed
                        ? "text-muted-foreground"
                        : "text-muted-foreground/50",
                  )}
                >
                  {s.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tablet (md to lg): circles + lines, no labels */}
      <div className="hidden md:flex lg:hidden items-center gap-0">
        {steps.map((s, i) => {
          const completed = i < currentIdx;
          const current = i === currentIdx;
          return (
            <div key={s.key} className="flex items-center">
              {i > 0 && (
                <div
                  className={cn(
                    "h-px w-6 mx-0.5",
                    completed
                      ? "bg-foreground/30"
                      : "bg-border/50",
                  )}
                />
              )}
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-all duration-300",
                  completed && "bg-green-500 text-white",
                  current &&
                    "bg-foreground text-background ring-2 ring-foreground/20 ring-offset-1 ring-offset-background",
                  !completed &&
                    !current &&
                    "border border-border/60 text-muted-foreground/50",
                )}
              >
                {completed ? (
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile (<md): compact text + progress track */}
      <div className="flex md:hidden flex-col items-end gap-1">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          Step {currentIdx + 1} of {steps.length}
          <span className="mx-1.5 text-border">·</span>
          <span className="text-foreground font-medium">
            {steps[currentIdx]?.label}
          </span>
        </span>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-border/40">
          <div
            className="h-full rounded-full bg-foreground transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Agent sub-step dots */}
      {subSteps != null && currentSubStep != null && currentStep === "agent" && (
        <div className="hidden md:flex items-center gap-1 ml-2">
          {Array.from({ length: subSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 w-1 rounded-full transition-all duration-300",
                i <= currentSubStep
                  ? "bg-foreground/60"
                  : "bg-muted-foreground/20",
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}
