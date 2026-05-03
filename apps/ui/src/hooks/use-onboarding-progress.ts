"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  loadProgress,
  saveProgress,
  isTier1Complete,
  isTier2Complete,
  type OnboardingProgress,
} from "@/lib/onboarding/progress";

const PAGE_KEY_MAP: Record<string, string> = {
  "/dashboard": "dashboard",
  "/dashboard/tasks": "tasks",
  "/dashboard/agents": "agents",
  "/dashboard/crm": "contacts",
  "/dashboard/contacts": "contacts",
  "/dashboard/knowledge": "knowledge",
  "/dashboard/routines": "routines",
  "/dashboard/collections": "collections",
};

export function useOnboardingProgress() {
  const [progress, setProgress] = useState<OnboardingProgress>(loadProgress);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const supabase = useMemo(() => {
    try { return createClient(); } catch { return null; }
  }, []);

  useEffect(() => {
    const current = loadProgress();
    setProgress(current);

    // Detect existing users who bypassed the v2 wizard (e.g. already onboarded)
    if (!current.wizardCompleted && supabase && pathname.startsWith("/dashboard")) {
      (async () => {
        const { count: agentCount } = await supabase.from("agents").select("id", { count: "exact", head: true });
        if (agentCount && agentCount > 0) {
          const updated: OnboardingProgress = {
            ...current,
            wizardCompleted: true,
            tier1: { ...current.tier1, agentCreated: true, dashboardExplored: true },
          };
          if (agentCount > 1) updated.tier2 = { ...updated.tier2, secondAgentCreated: true };
          const { count: taskCount } = await supabase.from("tasks").select("id", { count: "exact", head: true }).not("assignee_agent_id", "is", null);
          if (taskCount && taskCount > 0) updated.tier1.taskAssigned = true;
          const { count: knowledgeCount } = await supabase.from("knowledge_items").select("id", { count: "exact", head: true });
          if (knowledgeCount && knowledgeCount > 0) updated.tier1.knowledgeCreated = true;
          saveProgress(updated);
          setProgress(updated);
        }
      })();
    }

    const sync = () => setProgress(loadProgress());
    window.addEventListener("hq:onboarding-progress", sync);
    return () => window.removeEventListener("hq:onboarding-progress", sync);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  // Auto-track page visits
  useEffect(() => {
    const pageKey = PAGE_KEY_MAP[pathname];
    if (!pageKey) return;

    setProgress((prev) => {
      if (prev.pagesVisited.includes(pageKey)) return prev;
      const next = {
        ...prev,
        pagesVisited: [...prev.pagesVisited, pageKey],
      };
      // dashboardExplored: visited 3+ distinct pages
      if (next.pagesVisited.length >= 3 && !next.tier1.dashboardExplored) {
        next.tier1 = { ...next.tier1, dashboardExplored: true };
      }
      saveProgress(next);
      return next;
    });
  }, [pathname]);

  const markComplete = useCallback(
    (key: keyof OnboardingProgress["tier1"] | keyof OnboardingProgress["tier2"]) => {
      setProgress((prev) => {
        let next = { ...prev };
        if (key in prev.tier1) {
          next.tier1 = { ...prev.tier1, [key]: true };
        } else if (key in prev.tier2) {
          next.tier2 = { ...prev.tier2, [key]: true };
        }
        saveProgress(next);
        return next;
      });
    },
    [],
  );

  const markTipSeen = useCallback((tipKey: string) => {
    setProgress((prev) => {
      if (prev.microTipsSeen.includes(tipKey)) return prev;
      const next = { ...prev, microTipsSeen: [...prev.microTipsSeen, tipKey] };
      saveProgress(next);
      return next;
    });
  }, []);

  const markPageVisited = useCallback((pageKey: string) => {
    setProgress((prev) => {
      if (prev.pagesVisited.includes(pageKey)) return prev;
      const next = { ...prev, pagesVisited: [...prev.pagesVisited, pageKey] };
      if (next.pagesVisited.length >= 3 && !next.tier1.dashboardExplored) {
        next.tier1 = { ...next.tier1, dashboardExplored: true };
      }
      saveProgress(next);
      return next;
    });
  }, []);

  const dismiss = useCallback(() => {
    setProgress((prev) => {
      const next = { ...prev, dismissedAt: new Date().toISOString() };
      saveProgress(next);
      return next;
    });
  }, []);

  const markWizardCompleted = useCallback(() => {
    setProgress((prev) => {
      const next = { ...prev, wizardCompleted: true };
      saveProgress(next);
      return next;
    });
  }, []);

  return {
    progress,
    markComplete,
    markTipSeen,
    markPageVisited,
    dismiss,
    markWizardCompleted,
    isTier1Done: isTier1Complete(progress),
    isTier2Done: isTier2Complete(progress),
    isDismissed: !!progress.dismissedAt,
    showPanel: progress.wizardCompleted && !progress.dismissedAt && !(isTier1Complete(progress) && isTier2Complete(progress)),
  };
}
