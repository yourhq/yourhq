"use client";

import { Suspense, useMemo, useState } from "react";
import { AgentRow, groupAgentsByTeam, getFleetCounts } from "@/components/agents/agent-card";
import { AgentForm } from "@/components/agents/agent-form";
import { AgentCreateWizard } from "@/components/agents/agent-create-wizard";
import { useAgents } from "@/hooks/use-agents";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Bot, Search, X } from "lucide-react";
import type { Agent, AgentMeta } from "@/lib/agents/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

function AgentsContent() {
  const agents = useAgents();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);

  // Derive available teams from agent data
  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const a of agents.agents) {
      const team = ((a.meta as AgentMeta)?.team as string) || "Ungrouped";
      set.add(team);
    }
    return Array.from(set).sort((a, b) => {
      if (a === "Ungrouped") return 1;
      if (b === "Ungrouped") return -1;
      return a.localeCompare(b);
    });
  }, [agents.agents]);

  // Filter agents
  const filteredAgents = useMemo(() => {
    let list = agents.agents;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.slug.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (teamFilter !== "all") {
      list = list.filter((a) => {
        const team = ((a.meta as AgentMeta)?.team as string) || "Ungrouped";
        return team === teamFilter;
      });
    }
    return list;
  }, [agents.agents, searchQuery, statusFilter, teamFilter]);

  const teamGroups = useMemo(
    () => groupAgentsByTeam(filteredAgents),
    [filteredAgents]
  );

  const fleetCounts = useMemo(
    () => getFleetCounts(agents.agents),
    [agents.agents]
  );

  const hasActiveFilters =
    searchQuery.trim() !== "" || statusFilter !== "all" || teamFilter !== "all";

  const isFiltered = hasActiveFilters && filteredAgents.length !== agents.agents.length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Bot className="h-4 w-4" />}
        title="Agents"
        description="Registered agents and their context."
        primaryAction={
          <Button size="sm" onClick={agents.form.openCreateForm}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New agent
          </Button>
        }
      />

      {/* Filter bar */}
      {agents.agents.length > 0 && (
        <div className="shrink-0 border-b border-border/60 px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-[280px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-[13px]"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                size="sm"
                className={cn(
                  "min-w-[110px] text-[12px]",
                  statusFilter !== "all" && "border-foreground/30 bg-accent/50"
                )}
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>

            {teams.length > 1 && (
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger
                  size="sm"
                  className={cn(
                    "min-w-[110px] text-[12px]",
                    teamFilter !== "all" && "border-foreground/30 bg-accent/50"
                  )}
                >
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All teams</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-2"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setTeamFilter("all");
                }}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}

            <div className="flex-1" />

            <span className="text-[11px] text-muted-foreground tabular-nums">
              {isFiltered ? (
                <>
                  <span className="text-foreground">{filteredAgents.length}</span>
                  <span className="mx-0.5">/</span>
                  {agents.agents.length} agents
                </>
              ) : (
                <>
                  {agents.agents.length}{" "}
                  {agents.agents.length === 1 ? "agent" : "agents"}
                </>
              )}
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-5">
        {agents.loading ? (
          <div className="space-y-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-14 rounded-md bg-muted/20 animate-pulse"
              />
            ))}
          </div>
        ) : agents.agents.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No agents yet"
            description="Agents run tasks, process inboxes, and update your CRM in the background. Create one to get started."
            action={{
              label: "New agent",
              onClick: agents.form.openCreateForm,
            }}
          />
        ) : filteredAgents.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No matching agents"
            description="Try adjusting your search or filters."
            variant="filtered"
            onClearFilters={() => {
              setSearchQuery("");
              setStatusFilter("all");
              setTeamFilter("all");
            }}
          />
        ) : (
          <>
            {/* Fleet status strip — clickable to filter by status */}
            {fleetCounts.length > 0 && !hasActiveFilters && (
              <div className="mb-4 flex items-center gap-3 text-[12px] text-muted-foreground">
                {fleetCounts.map((fc, i) => (
                  <button
                    key={fc.status}
                    type="button"
                    onClick={() => setStatusFilter(fc.status)}
                    className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {i > 0 && (
                      <span className="text-border mr-1.5">&middot;</span>
                    )}
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: fc.color }}
                    />
                    {fc.count} {fc.label}
                  </button>
                ))}
              </div>
            )}

            {/* Team-grouped row list */}
            <div className="space-y-4">
              {teamGroups.map((group) => (
                <div key={group.team}>
                  <div className="px-3 pb-1.5">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground/50">
                      {group.team}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {group.agents.map((agent) => (
                      <AgentRow
                        key={agent.id}
                        agent={agent}
                        onEdit={agents.form.openEditForm}
                        onTogglePause={agents.actions.togglePause}
                        onDelete={(id) => {
                          const target = agents.agents.find((a) => a.id === id);
                          if (target) setPendingDelete(target);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {agents.form.showForm && agents.form.editingAgent && (
        <AgentForm
          editingAgent={agents.form.editingAgent}
          onSave={agents.form.onFormSaved}
          onCancel={agents.form.closeForm}
        />
      )}
      {agents.form.showForm && !agents.form.editingAgent && (
        <AgentCreateWizard
          onCreated={agents.actions.fetchAgents}
          onClose={agents.form.closeForm}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.name ?? "agent"}?`}
        description={
          <>
            This permanently removes the agent from your workspace. Its git
            branch and conversation history will no longer be accessible from
            HQ.
          </>
        }
        confirmLabel="Delete agent"
        onConfirm={async () => {
          if (!pendingDelete) return;
          await agents.actions.deleteAgent(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsContent />
    </Suspense>
  );
}
