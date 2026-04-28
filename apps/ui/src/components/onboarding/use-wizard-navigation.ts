"use client";

// Centralized navigation for the onboarding wizard.
//
// Three high-level operations:
//   - goNext(currentStep)        forward one step in canonical order
//   - goBack()                   step-aware Back (sub-phase first, then step)
//   - jumpTo(targetStep)         jump to any reachable (done/current) step
//
// "Sub-phase" awareness: Supabase and Gateway have internal phases
// (Supabase: brief→url→keys→provision; Gateway: placement→tailscale→boot).
// We let those steps register a sub-phase reducer so global Back unwinds
// the sub-phase before retreating from the step itself.
//
// "Reachable": only steps the user has visited or is currently on. Future
// steps stay locked. Reachability is computed from a `completed` set.
//
// "Stack": when the user jumps backward via the rail (e.g. from Gateway
// back to Supabase), pressing Back from there should return to where
// they were working — Gateway. We push the from-step onto a return stack
// on every jump and pop it on Back.

import { useCallback, useRef, useState } from "react";

export interface WizardNavigationConfig<TStep extends string> {
  steps: readonly TStep[];
  initial: TStep;
  /**
   * Per-step sub-phase Back handler. Return `true` if the step handled
   * Back internally (e.g. unwound a sub-phase) so the wizard should NOT
   * retreat to the previous step. Return `false` to let global Back run.
   */
  subPhaseBack?: Partial<Record<TStep, () => boolean>>;
}

export interface WizardNavigation<TStep extends string> {
  step: TStep;
  direction: "forward" | "back";
  /** Set of steps the user has reached at least once. */
  completed: ReadonlySet<TStep>;
  goNext: () => void;
  goBack: () => void;
  jumpTo: (target: TStep) => void;
  /** Force-set step + direction. Escape hatch for sub-phase teardown. */
  go: (target: TStep, direction?: "forward" | "back") => void;
  /** Mark a step done without changing the current step. */
  markComplete: (s: TStep) => void;
  /**
   * Drop completion for `step` and every step after it in canonical
   * order. Used when a reset (e.g. "connect a different Supabase
   * project") invalidates downstream state — the rail should reflect
   * that those steps need to be redone.
   */
  truncateCompleted: (step: TStep) => void;
  isReachable: (s: TStep) => boolean;
}

export function useWizardNavigation<TStep extends string>(
  config: WizardNavigationConfig<TStep>,
): WizardNavigation<TStep> {
  const { steps, initial, subPhaseBack } = config;
  const [step, setStep] = useState<TStep>(initial);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  // Steps the user has visited at least once. Seeded with `initial` so a
  // user resuming mid-flow sees all earlier steps as done.
  const [completed, setCompleted] = useState<Set<TStep>>(() => {
    const set = new Set<TStep>();
    const initialIdx = steps.indexOf(initial);
    for (let i = 0; i <= initialIdx; i++) set.add(steps[i]);
    return set;
  });
  // Return-stack for jumpTo. Only populated by jumps; cleared on natural
  // forward/back navigation so it doesn't leak across sessions.
  const returnStack = useRef<TStep[]>([]);

  const isReachable = useCallback(
    (s: TStep) => completed.has(s),
    [completed],
  );

  const go = useCallback(
    (target: TStep, dir: "forward" | "back" = "forward") => {
      setDirection(dir);
      setStep(target);
      setCompleted((prev) => {
        if (prev.has(target)) return prev;
        const next = new Set(prev);
        next.add(target);
        return next;
      });
    },
    [],
  );

  const goNext = useCallback(() => {
    const idx = steps.indexOf(step);
    if (idx < 0 || idx >= steps.length - 1) return;
    returnStack.current = [];
    go(steps[idx + 1], "forward");
  }, [step, steps, go]);

  const goBack = useCallback(() => {
    // 1. Sub-phase back has priority. If the active step handled it, stop.
    const handler = subPhaseBack?.[step];
    if (handler && handler()) {
      setDirection("back");
      return;
    }
    // 2. Return-stack pop (jumped here from a later step).
    const popped = returnStack.current.pop();
    if (popped && popped !== step) {
      go(popped, "back");
      return;
    }
    // 3. Linear back.
    const idx = steps.indexOf(step);
    if (idx <= 0) return;
    go(steps[idx - 1], "back");
  }, [step, steps, go, subPhaseBack]);

  const jumpTo = useCallback(
    (target: TStep) => {
      if (target === step) return;
      if (!completed.has(target)) return; // unreachable, no-op
      // Push current onto return stack so Back from the destination
      // returns here. We intentionally only push when jumping BACKWARD —
      // a forward jump (rare; only happens if we ever allow it) should
      // not stack the source.
      const fromIdx = steps.indexOf(step);
      const toIdx = steps.indexOf(target);
      if (toIdx < fromIdx) {
        returnStack.current = [...returnStack.current, step];
      } else {
        returnStack.current = [];
      }
      go(target, toIdx > fromIdx ? "forward" : "back");
    },
    [step, steps, completed, go],
  );

  const markComplete = useCallback((s: TStep) => {
    setCompleted((prev) => {
      if (prev.has(s)) return prev;
      const next = new Set(prev);
      next.add(s);
      return next;
    });
  }, []);

  const truncateCompleted = useCallback(
    (target: TStep) => {
      const targetIdx = steps.indexOf(target);
      if (targetIdx < 0) return;
      setCompleted((prev) => {
        const next = new Set<TStep>();
        for (const s of prev) {
          const i = steps.indexOf(s);
          if (i < targetIdx) next.add(s);
        }
        return next;
      });
    },
    [steps],
  );

  return {
    step,
    direction,
    completed,
    goNext,
    goBack,
    jumpTo,
    go,
    markComplete,
    truncateCompleted,
    isReachable,
  };
}
