import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  loadProgress,
  saveProgress,
  completeItem,
  isTier1Complete,
  isTier2Complete,
  tier1Count,
  tier2Count,
  type OnboardingProgress,
} from "@/lib/onboarding/progress";

const STORAGE_KEY = "hq_onboarding_progress";

describe("onboarding progress", () => {
  let store: Record<string, string>;
  let dispatchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = {};
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key: string) => store[key] ?? null
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      (key: string, value: string) => {
        store[key] = value;
      }
    );
    dispatchSpy = vi.fn();
    vi.spyOn(window, "dispatchEvent").mockImplementation(dispatchSpy);
  });

  function freshDefaults(): OnboardingProgress {
    return {
      wizardCompleted: false,
      tier1: {
        agentCreated: false,
        channelConnected: false,
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
  }

  describe("loadProgress", () => {
    test("returns defaults when storage is empty", () => {
      expect(loadProgress()).toEqual(freshDefaults());
    });

    test("returns a fresh copy each call (mutation isolation)", () => {
      const first = loadProgress();
      first.tier1.agentCreated = true;
      first.pagesVisited.push("agents");
      const second = loadProgress();
      expect(second.tier1.agentCreated).toBe(false);
      expect(second.pagesVisited).toEqual([]);
    });

    test("merges stored data with defaults", () => {
      store[STORAGE_KEY] = JSON.stringify({
        wizardCompleted: true,
        tier1: { agentCreated: true },
      });
      const progress = loadProgress();
      expect(progress.wizardCompleted).toBe(true);
      expect(progress.tier1.agentCreated).toBe(true);
      expect(progress.tier1.channelConnected).toBe(false);
      expect(progress.tier2.sourceConnected).toBe(false);
    });

    test("fills missing tier2 fields with defaults", () => {
      store[STORAGE_KEY] = JSON.stringify({
        tier2: { sourceConnected: true },
      });
      const progress = loadProgress();
      expect(progress.tier2.sourceConnected).toBe(true);
      expect(progress.tier2.routineCreated).toBe(false);
      expect(progress.tier2.desktopViewed).toBe(false);
      expect(progress.tier2.secondAgentCreated).toBe(false);
    });

    test("defaults arrays when missing from stored data", () => {
      store[STORAGE_KEY] = JSON.stringify({ wizardCompleted: true });
      const progress = loadProgress();
      expect(progress.pagesVisited).toEqual([]);
      expect(progress.microTipsSeen).toEqual([]);
    });

    test("returns defaults on invalid JSON", () => {
      store[STORAGE_KEY] = "corrupt";
      expect(loadProgress()).toEqual(freshDefaults());
    });
  });

  describe("saveProgress", () => {
    test("serializes to localStorage", () => {
      const progress = freshDefaults();
      progress.wizardCompleted = true;
      saveProgress(progress);
      const stored = JSON.parse(store[STORAGE_KEY]);
      expect(stored.wizardCompleted).toBe(true);
    });
  });

  describe("completeItem", () => {
    test("marks a tier1 item as complete and saves", () => {
      completeItem("agentCreated");
      const stored = JSON.parse(store[STORAGE_KEY]);
      expect(stored.tier1.agentCreated).toBe(true);
    });

    test("marks a tier2 item as complete and saves", () => {
      completeItem("sourceConnected");
      const stored = JSON.parse(store[STORAGE_KEY]);
      expect(stored.tier2.sourceConnected).toBe(true);
    });

    test("dispatches custom event", () => {
      completeItem("agentCreated");
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe("hq:onboarding-progress");
    });

    test("does not save if item already complete", () => {
      store[STORAGE_KEY] = JSON.stringify({
        ...freshDefaults(),
        tier1: { ...freshDefaults().tier1, agentCreated: true },
      });
      completeItem("agentCreated");
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    test("does nothing for unknown key", () => {
      completeItem("unknownKey");
      expect(store[STORAGE_KEY]).toBeUndefined();
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });

  describe("tier counting", () => {
    test("isTier1Complete returns false when incomplete", () => {
      const progress = freshDefaults();
      progress.tier1.agentCreated = true;
      expect(isTier1Complete(progress)).toBe(false);
    });

    test("isTier1Complete returns true when all done", () => {
      const progress = freshDefaults();
      progress.tier1.agentCreated = true;
      progress.tier1.channelConnected = true;
      progress.tier1.taskAssigned = true;
      progress.tier1.agentWorked = true;
      progress.tier1.knowledgeCreated = true;
      progress.tier1.dashboardExplored = true;
      expect(isTier1Complete(progress)).toBe(true);
    });

    test("isTier2Complete returns false when incomplete", () => {
      expect(isTier2Complete(freshDefaults())).toBe(false);
    });

    test("isTier2Complete returns true when all done", () => {
      const progress = freshDefaults();
      progress.tier2.sourceConnected = true;
      progress.tier2.routineCreated = true;
      progress.tier2.desktopViewed = true;
      progress.tier2.secondAgentCreated = true;
      expect(isTier2Complete(progress)).toBe(true);
    });

    test("tier1Count returns correct done and total", () => {
      const progress = freshDefaults();
      progress.tier1.agentCreated = true;
      progress.tier1.taskAssigned = true;
      expect(tier1Count(progress)).toEqual({ done: 2, total: 6 });
    });

    test("tier2Count returns correct done and total", () => {
      const progress = freshDefaults();
      progress.tier2.routineCreated = true;
      expect(tier2Count(progress)).toEqual({ done: 1, total: 4 });
    });

    test("tier1Count with zero done", () => {
      expect(tier1Count(freshDefaults())).toEqual({ done: 0, total: 6 });
    });

    test("tier2Count with all done", () => {
      const progress = freshDefaults();
      progress.tier2.sourceConnected = true;
      progress.tier2.routineCreated = true;
      progress.tier2.desktopViewed = true;
      progress.tier2.secondAgentCreated = true;
      expect(tier2Count(progress)).toEqual({ done: 4, total: 4 });
    });
  });
});
