"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

export type WizardStep =
  | "welcome"
  | "intent"
  | "infrastructure"
  | "provider"
  | "agent"
  | "account"
  | "payment"
  | "provisioning";

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

const HOSTED_STEPS: WizardStep[] = ["welcome", "intent", "payment", "provisioning", "provider", "agent"];
const OSS_STEPS: WizardStep[] = ["welcome", "intent", "infrastructure", "provider", "agent", "account"];

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

function getInitialStep(
  steps: WizardStep[],
  initialStep: WizardStep | undefined,
  session: WizardSession | null,
): WizardStep {
  if (initialStep) return initialStep;
  if (session?.step && steps.includes(session.step)) return session.step;
  return steps[0];
}

function getInitialData(
  initialData: WizardData | undefined,
  session: WizardSession | null,
): WizardData {
  if (initialData) return initialData;
  return session?.data ?? {};
}

export function useWizardState(opts: {
  isHosted: boolean;
  initialStep?: WizardStep;
  initialData?: WizardData;
}) {
  const steps = opts.isHosted ? HOSTED_STEPS : OSS_STEPS;

  // Always start with the server-safe value to avoid hydration mismatch.
  // sessionStorage is read in a useEffect after mount.
  const [step, setStep] = useState<WizardStep>(
    () => getInitialStep(steps, opts.initialStep, null),
  );
  const [data, setData] = useState<WizardData>(
    () => getInitialData(opts.initialData, null),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");

  const currentIndex = steps.indexOf(step);

  // Hydrate from sessionStorage after mount (client-only).
  // Discard stale sessions from a different user/workspace.
  useEffect(() => {
    const session = loadSession();
    if (!session) return;

    const currentIdentity = opts.initialData?.hostedWorkspaceId;
    const storedIdentity = session.data?.hostedWorkspaceId;
    if (currentIdentity && storedIdentity && currentIdentity !== storedIdentity) {
      clearWizardSession();
      return;
    }

    const hydratedStep = getInitialStep(steps, opts.initialStep, session);
    const hydratedData = getInitialData(opts.initialData, session);
    setStep(hydratedStep);
    setData(hydratedData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setDirection("forward");
      setStep(steps[idx + 1]);
    }
  }, [step, steps]);

  const goBack = useCallback(() => {
    const idx = steps.indexOf(step);
    if (idx > 0) {
      setError(null);
      setDirection("backward");
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
    direction,
    pending,
    startTransition,
    error,
    setError,
    currentIndex,
    isFirst: currentIndex === 0,
    isLast: currentIndex === steps.length - 1,
  };
}
