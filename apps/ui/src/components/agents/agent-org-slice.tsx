"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Agent, AgentMeta } from "@/lib/agents/types";
import { AgentNode } from "@/components/agents/agent-node";
import { sortAgentsByStatus } from "@/components/agents/agent-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface AgentOrgSliceProps {
  agent: Agent;
  allAgents: Agent[];
  onChangeManager: (newManagerId: string | null) => Promise<void> | void;
  disabled?: boolean;
}

/**
 * Compact 3-row neighborhood for the agent detail sidebar:
 *   • Manager pill (or "Operator" placeholder) — click to reassign.
 *   • Self + peers (other directs of the same manager).
 *   • Direct reports.
 *
 * Sized to fit the 280px DetailSidebar.
 */
export function AgentOrgSlice({
  agent,
  allAgents,
  onChangeManager,
  disabled = false,
}: AgentOrgSliceProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const manager = useMemo(
    () => allAgents.find((a) => a.id === agent.reports_to_id) ?? null,
    [allAgents, agent.reports_to_id],
  );

  const peers = useMemo(() => {
    const siblings = allAgents.filter(
      (a) => a.reports_to_id === agent.reports_to_id && a.id !== agent.id,
    );
    return sortAgentsByStatus(siblings);
  }, [allAgents, agent.id, agent.reports_to_id]);

  const directs = useMemo(() => {
    return sortAgentsByStatus(
      allAgents.filter((a) => a.reports_to_id === agent.id),
    );
  }, [allAgents, agent.id]);

  const managerCandidates = useMemo(
    () => allAgents.filter((a) => a.id !== agent.id),
    [allAgents, agent.id],
  );

  async function pickManager(newId: string | null) {
    setPickerOpen(false);
    await onChangeManager(newId);
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      {/* Manager row */}
      <div className="flex justify-center">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "group inline-flex h-8 max-w-full items-center gap-2 rounded-md border border-border/60 bg-background px-2 text-[12px] transition-colors hover:bg-muted/30",
                disabled && "opacity-60",
              )}
            >
              {manager ? (
                <ManagerLabel manager={manager} />
              ) : (
                <span className="text-muted-foreground/70">Operator (you)</span>
              )}
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="center">
            <button
              type="button"
              onClick={() => pickManager(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-accent",
                !agent.reports_to_id && "bg-accent/60",
              )}
            >
              <span className="text-muted-foreground/70">Operator (you)</span>
            </button>
            {managerCandidates.map((a) => {
              const meta = (a.meta ?? {}) as AgentMeta;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pickManager(a.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-accent",
                    agent.reports_to_id === a.id && "bg-accent/60",
                  )}
                >
                  {meta.emoji && <span>{meta.emoji}</span>}
                  <span className="truncate">{a.name}</span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>

      {/* Connector line manager → self */}
      <div className="flex justify-center" aria-hidden>
        <div className="h-3 border-l border-border/60" />
      </div>

      {/* Self + peers row */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <AgentNode agent={agent} variant="pill" asSelf className="max-w-full" />
        {peers.map((peer) => (
          <AgentNode
            key={peer.id}
            agent={peer}
            variant="pill"
            className="max-w-full"
          />
        ))}
      </div>

      {/* Connector line self → directs (only when there are directs) */}
      {directs.length > 0 && (
        <>
          <div className="flex justify-center" aria-hidden>
            <div className="h-3 border-l border-border/60" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {directs.map((d) => (
              <AgentNode
                key={d.id}
                agent={d}
                variant="pill"
                className="max-w-full"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ManagerLabel({ manager }: { manager: Agent }) {
  const meta = (manager.meta ?? {}) as AgentMeta;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {meta.emoji && <span className="shrink-0">{meta.emoji}</span>}
      <span className="truncate">{manager.name}</span>
    </span>
  );
}
