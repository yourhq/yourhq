"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

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

const SESSION_KEY = "hq_wizard_session";

interface WizardSession {
  step: WizardStep;
  data: WizardData;
}

function loadSession(): WizardSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WizardSession;
  } catch {
    return null;
  }
}

function saveSession(step: WizardStep, data: WizardData) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ step, data }));
  } catch {
    // Non-fatal
  }
}

export function clearWizardSession() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
}

export function useWizardState(opts: {
  isHosted: boolean;
  initialStep?: WizardStep;
  initialData?: WizardData;
}) {
  const steps = opts.isHosted ? HOSTED_STEPS : OSS_STEPS;

  const session = useRef(loadSession());
  const restoredStep = session.current?.step && steps.includes(session.current.step)
    ? session.current.step
    : null;

  const [step, setStep] = useState<WizardStep>(
    opts.initialStep ?? restoredStep ?? steps[0],
  );
  const [data, setData] = useState<WizardData>(
    opts.initialData ?? session.current?.data ?? {},
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentIndex = steps.indexOf(step);

  useEffect(() => {
    saveSession(step, data);
  }, [step, data]);

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
