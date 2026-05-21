"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, User } from "lucide-react";
import type { Agent } from "@/lib/agents/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { sortAgentsByStatus } from "@/components/agents/agent-card";
import { AgentNode } from "@/components/agents/agent-node";
import { layoutOrgTree } from "@/lib/agents/org-layout";
import { cn } from "@/lib/utils";

interface AgentOrgChartProps {
  agents: Agent[];
  onEdit?: (agent: Agent) => void;
  onTogglePause?: (id: string, status: string) => void;
  onDelete?: (id: string) => void;
}

const NODE_W = 240;
const NODE_H = 56;
const GAP_X = 28;
const GAP_Y = 48;
const OPERATOR_ROOT_ID = "__operator_root__";

export function AgentOrgChart({
  agents,
  onEdit,
  onTogglePause,
  onDelete,
}: AgentOrgChartProps) {
  const mobile = useIsMobile();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sortedAgents = useMemo(() => sortAgentsByStatus(agents), [agents]);

  const layout = useMemo(
    () =>
      layoutOrgTree(sortedAgents, {
        nodeW: NODE_W,
        nodeH: NODE_H,
        gapX: GAP_X,
        gapY: GAP_Y,
        collapsed,
        syntheticRootId: OPERATOR_ROOT_ID,
      }),
    [sortedAgents, collapsed],
  );

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const n of layout.nodes) {
      map.set(n.agent.id, { x: n.x, y: n.y, w: n.w, h: n.h });
    }
    return map;
  }, [layout.nodes]);

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (mobile) {
    const agentMap = new Map(sortedAgents.map((a) => [a.id, a]));
    const roots = sortedAgents.filter(
      (a) => !a.reports_to_id || !agentMap.has(a.reports_to_id),
    );
    const childrenOf = (parentId: string) =>
      sortedAgents.filter((a) => a.reports_to_id === parentId);

    function renderMobileNode(agent: Agent, depth: number): React.ReactNode {
      const children = childrenOf(agent.id);
      const isCollapsed = collapsed.has(agent.id);
      return (
        <div key={agent.id}>
          <div
            className="flex items-center gap-2"
            style={{ paddingLeft: `${depth * 20}px` }}
          >
            {children.length > 0 && (
              <button
                type="button"
                onClick={() => toggleCollapsed(agent.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            )}
            {children.length === 0 && <div className="w-5 shrink-0" />}
            <div className="flex-1 min-w-0 py-1">
              <AgentNode
                agent={agent}
                onEdit={onEdit}
                onTogglePause={onTogglePause}
                onDelete={onDelete}
              />
            </div>
          </div>
          {!isCollapsed &&
            children.map((child) => renderMobileNode(child, depth + 1))}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 py-1">
          <div className="w-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <OperatorNode />
          </div>
        </div>
        {roots.map((agent) => renderMobileNode(agent, 1))}
      </div>
    );
  }

  return (
    <div className="flex justify-center overflow-auto py-6">
      <div
        className="relative"
        style={{
          width: Math.max(layout.width, 320),
          height: Math.max(layout.height, NODE_H),
        }}
      >
        <svg
          className="pointer-events-none absolute inset-0"
          width={layout.width}
          height={layout.height}
          aria-hidden
        >
          {layout.edges.map((edge) => {
            const from = positions.get(edge.fromId);
            const to = positions.get(edge.toId);
            if (!from || !to) return null;
            const x1 = from.x + from.w / 2;
            const y1 = from.y + from.h;
            const x2 = to.x + to.w / 2;
            const y2 = to.y;
            const midY = y1 + (y2 - y1) / 2;
            const path = `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
            return (
              <path
                key={`${edge.fromId}-${edge.toId}`}
                d={path}
                fill="none"
                className="text-border"
                style={{ stroke: "currentColor" }}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            );
          })}
        </svg>

        {layout.nodes.map((node) => (
          <div
            key={node.agent.id}
            className="absolute"
            style={{
              left: node.x,
              top: node.y,
              width: node.w,
              height: node.h,
            }}
          >
            {node.agent.id === OPERATOR_ROOT_ID ? (
              <OperatorNode />
            ) : (
              <AgentNode
                agent={node.agent}
                onEdit={onEdit}
                onTogglePause={onTogglePause}
                onDelete={onDelete}
              />
            )}
            {node.hasChildren && node.agent.id !== OPERATOR_ROOT_ID && (
              <button
                type="button"
                onClick={() => toggleCollapsed(node.agent.id)}
                className={cn(
                  "absolute left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-foreground/40 hover:text-foreground",
                )}
                style={{ bottom: -10 }}
                title={collapsed.has(node.agent.id) ? "Expand" : "Collapse"}
                aria-label={
                  collapsed.has(node.agent.id) ? "Expand subtree" : "Collapse subtree"
                }
              >
                {collapsed.has(node.agent.id) ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OperatorNode() {
  return (
    <div className="flex h-full items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-3 shadow-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <User className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-[13px] font-semibold text-foreground">You</span>
        <span className="ml-1.5 text-[11px] text-muted-foreground">Operator</span>
      </div>
    </div>
  );
}
