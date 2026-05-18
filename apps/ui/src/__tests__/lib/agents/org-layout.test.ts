import { describe, test, expect } from "vitest";
import { layoutOrgTree } from "@/lib/agents/org-layout";
import type { Agent } from "@/lib/agents/types";

function makeAgent(overrides: Partial<Agent> & { id: string }): Agent {
  return {
    created_at: "",
    updated_at: "",
    name: overrides.id,
    slug: overrides.id,
    description: null,
    avatar_url: null,
    status: "ready",
    last_seen_at: null,
    gateway_id: null,
    reports_to_id: null,
    domains: [],
    capabilities: null,
    model: null,
    thinking: null,
    config: {},
    meta: {},
    ...overrides,
  };
}

describe("layoutOrgTree", () => {
  test("returns empty layout for empty agents list", () => {
    const result = layoutOrgTree([]);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.width).toBe(32); // padX * 2
    expect(result.height).toBe(16); // padY * 2
  });

  test("lays out a single agent", () => {
    const agents = [makeAgent({ id: "a1" })];
    const result = layoutOrgTree(agents);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    expect(result.nodes[0].agent.id).toBe("a1");
    expect(result.nodes[0].x).toBe(16); // padX
    expect(result.nodes[0].y).toBe(8); // padY
    expect(result.nodes[0].w).toBe(200);
    expect(result.nodes[0].h).toBe(52);
    expect(result.nodes[0].hasChildren).toBe(false);
  });

  test("lays out parent-child hierarchy", () => {
    const agents = [
      makeAgent({ id: "boss" }),
      makeAgent({ id: "worker", reports_to_id: "boss" }),
    ];
    const result = layoutOrgTree(agents);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toEqual({ fromId: "boss", toId: "worker" });

    const bossNode = result.nodes.find((n) => n.agent.id === "boss")!;
    const workerNode = result.nodes.find((n) => n.agent.id === "worker")!;
    expect(bossNode.hasChildren).toBe(true);
    expect(workerNode.hasChildren).toBe(false);
    expect(workerNode.y).toBeGreaterThan(bossNode.y);
  });

  test("multiple roots are placed side by side", () => {
    const agents = [makeAgent({ id: "r1" }), makeAgent({ id: "r2" })];
    const result = layoutOrgTree(agents);
    expect(result.nodes).toHaveLength(2);
    const r1 = result.nodes.find((n) => n.agent.id === "r1")!;
    const r2 = result.nodes.find((n) => n.agent.id === "r2")!;
    expect(r1.y).toBe(r2.y);
    expect(r2.x).toBeGreaterThan(r1.x);
  });

  test("parent is centered over children", () => {
    const agents = [
      makeAgent({ id: "boss" }),
      makeAgent({ id: "w1", reports_to_id: "boss" }),
      makeAgent({ id: "w2", reports_to_id: "boss" }),
    ];
    const result = layoutOrgTree(agents);
    const boss = result.nodes.find((n) => n.agent.id === "boss")!;
    const w1 = result.nodes.find((n) => n.agent.id === "w1")!;
    const w2 = result.nodes.find((n) => n.agent.id === "w2")!;

    const childrenCenter = (w1.x + w2.x + 200) / 2;
    const bossCenter = boss.x + 100;
    expect(bossCenter).toBeCloseTo(childrenCenter, 0);
  });

  test("custom node dimensions are respected", () => {
    const agents = [makeAgent({ id: "a1" })];
    const result = layoutOrgTree(agents, { nodeW: 100, nodeH: 30 });
    expect(result.nodes[0].w).toBe(100);
    expect(result.nodes[0].h).toBe(30);
  });

  test("collapsed nodes hide children", () => {
    const agents = [
      makeAgent({ id: "boss" }),
      makeAgent({ id: "worker", reports_to_id: "boss" }),
    ];
    const collapsed = new Set(["boss"]);
    const result = layoutOrgTree(agents, { collapsed });
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(0);

    const boss = result.nodes.find((n) => n.agent.id === "boss")!;
    expect(boss.hasChildren).toBe(true);
  });

  test("agent with reports_to_id pointing outside set is treated as root", () => {
    const agents = [makeAgent({ id: "a1", reports_to_id: "nonexistent" })];
    const result = layoutOrgTree(agents);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].y).toBe(8); // at root depth + padY
  });

  test("sort option orders children", () => {
    const agents = [
      makeAgent({ id: "boss" }),
      makeAgent({ id: "charlie", reports_to_id: "boss", name: "Charlie" }),
      makeAgent({ id: "alice", reports_to_id: "boss", name: "Alice" }),
      makeAgent({ id: "bob", reports_to_id: "boss", name: "Bob" }),
    ];
    const result = layoutOrgTree(agents, {
      sort: (a, b) => a.name.localeCompare(b.name),
    });

    const childNodes = result.nodes.filter((n) => n.agent.reports_to_id === "boss");
    childNodes.sort((a, b) => a.x - b.x);
    expect(childNodes.map((n) => n.agent.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  test("cycle detection prevents infinite loop", () => {
    const agents = [
      makeAgent({ id: "a", reports_to_id: "b" }),
      makeAgent({ id: "b", reports_to_id: "a" }),
    ];
    const result = layoutOrgTree(agents);
    expect(result.nodes.length).toBe(2);
  });

  test("three-level hierarchy has correct depth spacing", () => {
    const agents = [
      makeAgent({ id: "ceo" }),
      makeAgent({ id: "vp", reports_to_id: "ceo" }),
      makeAgent({ id: "dev", reports_to_id: "vp" }),
    ];
    const result = layoutOrgTree(agents);
    const ceo = result.nodes.find((n) => n.agent.id === "ceo")!;
    const vp = result.nodes.find((n) => n.agent.id === "vp")!;
    const dev = result.nodes.find((n) => n.agent.id === "dev")!;

    const rowHeight = 52 + 36; // nodeH + gapY
    expect(vp.y - ceo.y).toBe(rowHeight);
    expect(dev.y - vp.y).toBe(rowHeight);
  });

  test("width and height include all nodes plus padding", () => {
    const agents = [makeAgent({ id: "a1" })];
    const result = layoutOrgTree(agents, { padX: 20, padY: 10 });
    expect(result.width).toBe(200 + 20 * 2);
    expect(result.height).toBe(52 + 10 * 2);
  });

  test("custom padding shifts node positions", () => {
    const agents = [makeAgent({ id: "a1" })];
    const result = layoutOrgTree(agents, { padX: 50, padY: 25 });
    expect(result.nodes[0].x).toBe(50);
    expect(result.nodes[0].y).toBe(25);
  });
});
