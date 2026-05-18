import { describe, test, expect } from "vitest";
import {
  PLUGIN_SOURCE_META,
  PLUGIN_EVENT_STATUS_META,
  AVAILABLE_HOOKS,
} from "@/lib/plugins/types";
import type { PluginSource, PluginEventStatus } from "@/lib/plugins/types";

describe("PLUGIN_SOURCE_META", () => {
  const ALL_SOURCES: PluginSource[] = ["builtin", "local", "webhook", "marketplace"];

  test("has metadata for every source type", () => {
    for (const s of ALL_SOURCES) {
      expect(PLUGIN_SOURCE_META[s]).toBeDefined();
      expect(PLUGIN_SOURCE_META[s].label).toBeTruthy();
      expect(PLUGIN_SOURCE_META[s].color).toBeTruthy();
    }
  });
});

describe("PLUGIN_EVENT_STATUS_META", () => {
  const ALL_STATUSES: PluginEventStatus[] = ["success", "error", "timeout", "skipped"];

  test("has metadata for every event status", () => {
    for (const s of ALL_STATUSES) {
      expect(PLUGIN_EVENT_STATUS_META[s]).toBeDefined();
      expect(PLUGIN_EVENT_STATUS_META[s].label).toBeTruthy();
      expect(PLUGIN_EVENT_STATUS_META[s].color).toBeTruthy();
    }
  });
});

describe("AVAILABLE_HOOKS", () => {
  test("is a non-empty array", () => {
    expect(AVAILABLE_HOOKS.length).toBeGreaterThan(0);
  });

  test("each hook has value, label, and description", () => {
    for (const hook of AVAILABLE_HOOKS) {
      expect(hook.value).toBeTruthy();
      expect(hook.label).toBeTruthy();
      expect(hook.description).toBeTruthy();
    }
  });

  test("hook values follow entity.action pattern", () => {
    for (const hook of AVAILABLE_HOOKS) {
      expect(hook.value).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  test("has no duplicate hook values", () => {
    const values = AVAILABLE_HOOKS.map((h) => h.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
