"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Agent } from "@/lib/agents/types";
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

const NODE_W = 200;
const NODE_H = 52;
const GAP_X = 20;
const GAP_Y = 36;

export function AgentOrgChart({
  agents,
  onEdit,
  onTogglePause,
  onDelete,
}: AgentOrgChartProps) {
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

  return (
    <div className="overflow-auto">
      <div
        className="relative"
        style={{
          width: Math.max(layout.width, 320),
          height: Math.max(layout.height, NODE_H),
        }}
      >
        {/* Connector elbows — quiet 1px lines */}
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
                stroke="hsl(var(--border))"
                strokeWidth={1}
                className="text-border/60"
                style={{ stroke: "currentColor" }}
              />
            );
          })}
        </svg>

        {/* Boxed nodes */}
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
            <AgentNode
              agent={node.agent}
              onEdit={onEdit}
              onTogglePause={onTogglePause}
              onDelete={onDelete}
            />
            {node.hasChildren && (
              <button
                type="button"
                onClick={() => toggleCollapsed(node.agent.id)}
                className={cn(
                  "absolute left-1/2 z-10 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded border border-border/60 bg-background text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground",
                )}
                style={{ bottom: -8 }}
                title={collapsed.has(node.agent.id) ? "Expand" : "Collapse"}
                aria-label={
                  collapsed.has(node.agent.id) ? "Expand subtree" : "Collapse subtree"
                }
              >
                {collapsed.has(node.agent.id) ? (
                  <ChevronRight className="h-2.5 w-2.5" />
                ) : (
                  <ChevronDown className="h-2.5 w-2.5" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
