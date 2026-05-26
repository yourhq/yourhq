"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, ArrowRight } from "lucide-react";
import type { AgentFleetEnriched } from "@/lib/types/dashboard";
import { EmptyState } from "@/components/shared/empty-state";
import { AgentGridCard } from "./agent-grid-card";
import { cn } from "@/lib/utils";

function gridCols(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-sm";
  if (count <= 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  if (count <= 6) return "grid-cols-2 lg:grid-cols-3";
  return "grid-cols-2 lg:grid-cols-4";
}

export function AgentFleetGrid({
  agents,
}: {
  agents: AgentFleetEnriched[];
}) {
  const router = useRouter();

  if (agents.length === 0) {
    return (
      <section className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm">
        <EmptyState
          icon={Bot}
          title="No agents yet"
          description="Create your first agent to get started. Agents are persistent AI workers that handle tasks, CRM, and more."
          action={{
            label: "Create an agent",
            onClick: () => router.push("/dashboard/agents"),
          }}
          compact
        />
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-label text-muted-foreground/70">Your team</h2>
        <Link
          href="/dashboard/agents"
          className="group flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          View all {agents.length}
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className={cn("grid gap-2.5", gridCols(agents.length))}>
        {agents.map((agent) => (
          <AgentGridCard key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  );
}
