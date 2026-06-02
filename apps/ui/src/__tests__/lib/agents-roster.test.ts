import { describe, it, expect } from "vitest";
import {
  AGENT_ROSTER,
  INTENT_TO_AGENT_KEY,
  type AgentTemplate,
} from "@/lib/agents/roster";

describe("agent roster", () => {
  it("exports a non-empty roster", () => {
    expect(AGENT_ROSTER.length).toBeGreaterThan(0);
  });

  it("every roster entry has required fields", () => {
    for (const agent of AGENT_ROSTER) {
      expect(agent.key).toBeTruthy();
      expect(agent.branch).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.emoji).toBeTruthy();
      expect(agent.role).toBeTruthy();
      expect(agent.description).toBeTruthy();
      expect(agent.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("has unique keys", () => {
    const keys = AGENT_ROSTER.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("INTENT_TO_AGENT_KEY maps to valid roster keys", () => {
    const rosterKeys = new Set(AGENT_ROSTER.map((a) => a.key));
    for (const [intent, agentKey] of Object.entries(INTENT_TO_AGENT_KEY)) {
      expect(rosterKeys.has(agentKey)).toBe(true);
    }
  });

  it("AgentTemplate type is usable", () => {
    const t: AgentTemplate = AGENT_ROSTER[0];
    expect(t.key).toBeTruthy();
  });
});
