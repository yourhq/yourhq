import type { Agent } from "./types";

export interface OrgLayoutNode {
  agent: Agent;
  x: number;
  y: number;
  w: number;
  h: number;
  hasChildren: boolean;
}

export interface OrgLayoutEdge {
  fromId: string;
  toId: string;
}

export interface OrgLayout {
  nodes: OrgLayoutNode[];
  edges: OrgLayoutEdge[];
  width: number;
  height: number;
}

export interface OrgLayoutOptions {
  nodeW?: number;
  nodeH?: number;
  gapX?: number;
  gapY?: number;
  padX?: number;
  padY?: number;
  collapsed?: ReadonlySet<string>;
  sort?: (a: Agent, b: Agent) => number;
  /** When set, inserts a synthetic root node that all parentless agents report to. */
  syntheticRootId?: string;
}

const DEFAULTS = {
  nodeW: 200,
  nodeH: 52,
  gapX: 20,
  gapY: 36,
  padX: 16,
  padY: 8,
};

/**
 * Tidy-tree-lite layout for the agent org chart. Multi-rooted forest:
 * roots are agents whose `reports_to_id` is null OR points outside the
 * passed-in set. Cycles are broken by tracking visited ids.
 */
export function layoutOrgTree(
  agents: Agent[],
  opts: OrgLayoutOptions = {},
): OrgLayout {
  const nodeW = opts.nodeW ?? DEFAULTS.nodeW;
  const nodeH = opts.nodeH ?? DEFAULTS.nodeH;
  const gapX = opts.gapX ?? DEFAULTS.gapX;
  const gapY = opts.gapY ?? DEFAULTS.gapY;
  const padX = opts.padX ?? DEFAULTS.padX;
  const padY = opts.padY ?? DEFAULTS.padY;
  const collapsed = opts.collapsed ?? new Set<string>();
  const sort = opts.sort;
  const syntheticRootId = opts.syntheticRootId;

  const byId = new Map(agents.map((a) => [a.id, a]));
  const childrenMap = new Map<string | null, Agent[]>();
  for (const a of agents) {
    const rawParent = a.reports_to_id ?? null;
    const parent = rawParent && byId.has(rawParent) ? rawParent : null;
    const arr = childrenMap.get(parent) ?? [];
    arr.push(a);
    childrenMap.set(parent, arr);
  }
  if (sort) {
    for (const [, list] of childrenMap) list.sort(sort);
  }

  const naturalRoots = childrenMap.get(null) ?? [];

  // If a synthetic root was requested, all natural roots become its children.
  let syntheticAgent: Agent | undefined;
  if (syntheticRootId && naturalRoots.length > 0) {
    syntheticAgent = {
      id: syntheticRootId,
      name: "You",
      slug: "__operator__",
      status: "ready",
      description: null,
      reports_to_id: null,
      gateway_id: null,
      meta: null,
      avatar_url: null,
      tenant_id: "",
      created_at: "",
      updated_at: "",
    } as Agent;
    byId.set(syntheticRootId, syntheticAgent);
    childrenMap.set(syntheticRootId, naturalRoots);
    childrenMap.set(null, [syntheticAgent]);
  }

  const roots = childrenMap.get(null) ?? [];

  // First pass: compute subtree width per visited node.
  const widthCache = new Map<string, number>();
  function subtreeWidth(id: string, visited: Set<string>): number {
    if (widthCache.has(id)) return widthCache.get(id)!;
    if (visited.has(id) || collapsed.has(id)) {
      widthCache.set(id, nodeW);
      return nodeW;
    }
    visited.add(id);
    const kids = childrenMap.get(id) ?? [];
    if (kids.length === 0) {
      widthCache.set(id, nodeW);
      visited.delete(id);
      return nodeW;
    }
    const total =
      kids.reduce((acc, k) => acc + subtreeWidth(k.id, visited), 0) +
      gapX * (kids.length - 1);
    const w = Math.max(nodeW, total);
    widthCache.set(id, w);
    visited.delete(id);
    return w;
  }

  const nodes: OrgLayoutNode[] = [];
  const edges: OrgLayoutEdge[] = [];
  const placed = new Set<string>();

  // Second pass: assign x/y via DFS, centering parents over their children.
  function place(
    agent: Agent,
    leftEdge: number,
    depth: number,
    visited: Set<string>,
  ) {
    if (placed.has(agent.id) || visited.has(agent.id)) return;
    visited.add(agent.id);

    const isCollapsed = collapsed.has(agent.id);
    const kids = isCollapsed ? [] : (childrenMap.get(agent.id) ?? []);
    const totalW = subtreeWidth(agent.id, new Set(visited));

    const x = leftEdge + (totalW - nodeW) / 2;
    const y = depth * (nodeH + gapY);

    placed.add(agent.id);
    nodes.push({
      agent,
      x,
      y,
      w: nodeW,
      h: nodeH,
      hasChildren: (childrenMap.get(agent.id) ?? []).length > 0,
    });

    let cursor = leftEdge;
    for (const child of kids) {
      const childW = subtreeWidth(child.id, new Set(visited));
      edges.push({ fromId: agent.id, toId: child.id });
      place(child, cursor, depth + 1, visited);
      cursor += childW + gapX;
    }
    visited.delete(agent.id);
  }

  let cursor = 0;
  for (const root of roots) {
    const w = subtreeWidth(root.id, new Set());
    place(root, cursor, 0, new Set());
    cursor += w + gapX * 2;
  }

  // Any agent that wasn't placed (e.g. part of a pure cycle) becomes a
  // synthetic root so the chart still renders something.
  for (const a of agents) {
    if (placed.has(a.id)) continue;
    const w = subtreeWidth(a.id, new Set());
    place(a, cursor, 0, new Set());
    cursor += w + gapX * 2;
  }

  // Compute bounding box.
  let maxRight = 0;
  let maxBottom = 0;
  for (const n of nodes) {
    if (n.x + n.w > maxRight) maxRight = n.x + n.w;
    if (n.y + n.h > maxBottom) maxBottom = n.y + n.h;
  }

  // Apply outer padding by translating all nodes and growing the canvas.
  for (const n of nodes) {
    n.x += padX;
    n.y += padY;
  }

  return {
    nodes,
    edges,
    width: maxRight + padX * 2,
    height: maxBottom + padY * 2,
  };
}
