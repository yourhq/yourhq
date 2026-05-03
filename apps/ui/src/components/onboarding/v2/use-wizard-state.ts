"use client";

import { useCallback, useState, useTransition } from "react";

export type WizardStep =
  | "welcome"
  | "intent"
  | "infrastructure"
  | "provider"
  | "agent";

export interface WizardData {
  ownerName?: string;
  preferredName?: string;
  workspaceName?: string;
  workspaceSlug?: string;
  intentKey?: string;
  contextPresetKey?: string;
  providerId?: string;
  providerCommandId?: string;
  agentId?: string;
  agentSlug?: string;
  agentName?: string;
  agentEmoji?: string;
  agentTemplateBranch?: string;
  channelType?: string;
  channelToken?: string;
  provisionCommandId?: string;
  pairingCode?: string;
  [key: string]: unknown;
}

const HOSTED_STEPS: WizardStep[] = ["welcome", "intent", "provider", "agent"];
const OSS_STEPS: WizardStep[] = ["welcome", "intent", "infrastructure", "provider", "agent"];

export function useWizardState(opts: {
  isHosted: boolean;
  initialStep?: WizardStep;
  initialData?: WizardData;
}) {
  const steps = opts.isHosted ? HOSTED_STEPS : OSS_STEPS;
  const [step, setStep] = useState<WizardStep>(opts.initialStep ?? steps[0]);
  const [data, setData] = useState<WizardData>(opts.initialData ?? {});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentIndex = steps.indexOf(step);

  const patch = useCallback((updates: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  const goTo = useCallback(
    (target: WizardStep) => {
      setError(null);
      setStep(target);
    },
    [],
  );

  const advance = useCallback(() => {
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) {
      setError(null);
      setStep(steps[idx + 1]);
    }
  }, [step, steps]);

  const goBack = useCallback(() => {
    const idx = steps.indexOf(step);
    if (idx > 0) {
      setError(null);
      setStep(steps[idx - 1]);
    }
  }, [step, steps]);

  return {
    step,
    steps,
    data,
    patch,
    goTo,
    advance,
    goBack,
    pending,
    startTransition,
    error,
    setError,
    currentIndex,
    isFirst: currentIndex === 0,
    isLast: currentIndex === steps.length - 1,
  };
}
