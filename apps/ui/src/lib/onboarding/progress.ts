export interface OnboardingProgress {
  wizardCompleted: boolean;
  tier1: {
    agentCreated: boolean;
    taskAssigned: boolean;
    agentWorked: boolean;
    knowledgeCreated: boolean;
    dashboardExplored: boolean;
  };
  tier2: {
    sourceConnected: boolean;
    routineCreated: boolean;
    desktopViewed: boolean;
    secondAgentCreated: boolean;
  };
  pagesVisited: string[];
  microTipsSeen: string[];
  dismissedAt: string | null;
}

const STORAGE_KEY = "hq_onboarding_progress";

const DEFAULT_PROGRESS: OnboardingProgress = {
  wizardCompleted: false,
  tier1: {
    agentCreated: false,
    taskAssigned: false,
    agentWorked: false,
    knowledgeCreated: false,
    dashboardExplored: false,
  },
  tier2: {
    sourceConnected: false,
    routineCreated: false,
    desktopViewed: false,
    secondAgentCreated: false,
  },
  pagesVisited: [],
  microTipsSeen: [],
  dismissedAt: null,
};

export function loadProgress(): OnboardingProgress {
  if (typeof window === "undefined") return DEFAULT_PROGRESS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROGRESS;
    return { ...DEFAULT_PROGRESS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function saveProgress(progress: OnboardingProgress): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // localStorage quota exceeded or unavailable
  }
}

export function isTier1Complete(progress: OnboardingProgress): boolean {
  return Object.values(progress.tier1).every(Boolean);
}

export function isTier2Complete(progress: OnboardingProgress): boolean {
  return Object.values(progress.tier2).every(Boolean);
}

export function tier1Count(progress: OnboardingProgress): { done: number; total: number } {
  const values = Object.values(progress.tier1);
  return { done: values.filter(Boolean).length, total: values.length };
}

export function tier2Count(progress: OnboardingProgress): { done: number; total: number } {
  const values = Object.values(progress.tier2);
  return { done: values.filter(Boolean).length, total: values.length };
}

export function completeItem(key: string): void {
  const progress = loadProgress();
  if (key in progress.tier1) {
    if ((progress.tier1 as Record<string, boolean>)[key]) return;
    (progress.tier1 as Record<string, boolean>)[key] = true;
  } else if (key in progress.tier2) {
    if ((progress.tier2 as Record<string, boolean>)[key]) return;
    (progress.tier2 as Record<string, boolean>)[key] = true;
  } else {
    return;
  }
  saveProgress(progress);
  window.dispatchEvent(new CustomEvent("hq:onboarding-progress"));
}
