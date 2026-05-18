import type { Agent } from "@/lib/agents/types";

let counter = 0;

export function buildAgent(overrides: Partial<Agent> = {}): Agent {
  counter++;
  return {
    id: `agent-${counter}`,
    slug: `test-agent-${counter}`,
    name: `Test Agent ${counter}`,
    description: "A test agent",
    avatar_url: null,
    status: "ready",
    gateway_id: "gw-default",
    reports_to_id: null,
    last_seen_at: new Date().toISOString(),
    domains: [],
    capabilities: null,
    model: null,
    thinking: null,
    config: {},
    meta: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function resetAgentCounter() {
  counter = 0;
}
