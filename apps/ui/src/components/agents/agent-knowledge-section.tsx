"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";

interface SkillItem {
  id: string;
  title: string;
  kind: string;
  scope: string;
  updated_at: string;
  created_at: string;
}

interface AuditEntry {
  entity_id: string;
  actor_type: string;
  actor_agent_id: string | null;
  action: string;
  summary: string | null;
  created_at: string;
}

interface Props {
  agentId: string;
  agentSlug: string;
}

const MAX_ITEMS = 8;
const RECENCY_DAYS = 7;

export function AgentKnowledgeSection({ agentId, agentSlug: _agentSlug }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<SkillItem[]>([]);
  const [recentEdits, setRecentEdits] = useState<Map<string, AuditEntry>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchSkills = useCallback(async () => {
    const { data: junctions } = await supabase
      .from("knowledge_item_agents")
      .select("knowledge_item_id")
      .eq("agent_id", agentId);

    if (!junctions?.length) {
      setItems([]);
      setLoading(false);
      return;
    }

    const itemIds = junctions.map((j: { knowledge_item_id: string }) => j.knowledge_item_id);
    const { data } = await supabase
      .from("knowledge_items")
      .select("id, title, kind, scope, updated_at, created_at")
      .in("id", itemIds)
      .eq("kind", "skill")
      .is("archived_at", null)
      .order("updated_at", { ascending: false });

    setItems((data ?? []) as SkillItem[]);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RECENCY_DAYS);

    const { data: audits } = await supabase
      .from("audit_log")
      .select("entity_id, actor_type, actor_agent_id, action, summary, created_at")
      .eq("entity_type", "knowledge_item")
      .in("entity_id", itemIds)
      .eq("actor_type", "agent")
      .eq("actor_agent_id", agentId)
      .gte("created_at", cutoff.toISOString())
      .order("created_at", { ascending: false });

    const editMap = new Map<string, AuditEntry>();
    for (const a of (audits ?? []) as AuditEntry[]) {
      if (!editMap.has(a.entity_id)) {
        editMap.set(a.entity_id, a);
      }
    }
    setRecentEdits(editMap);
    setLoading(false);
  }, [supabase, agentId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useRealtime({
    table: "knowledge_items",
    onPayload: () => fetchSkills(),
  });

  useRealtime({
    table: "knowledge_item_agents",
    filter: `agent_id=eq.${agentId}`,
    onPayload: () => fetchSkills(),
  });

  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - RECENCY_DAYS);
    return d;
  }, []);

  if (loading) {
    return (
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <BookOpen className="mr-1.5 inline h-3 w-3" />
          Skills
        </h2>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted/30" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <BookOpen className="mr-1.5 inline h-3 w-3" />
          Skills {items.length > 0 && `(${items.length})`}
        </h2>
        <Link href={`/dashboard/knowledge?scope=${agentId}`}>
          <Button variant="ghost" size="icon-sm" className="h-5 w-5" title="Add skill">
            <Plus className="h-3 w-3" />
          </Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No skills yet. This agent will develop skills as it works, or you can assign some from the knowledge hub.
        </p>
      ) : (
        <div className="space-y-0.5">
          {items.slice(0, MAX_ITEMS).map((item) => {
            const audit = recentEdits.get(item.id);
            const wasRecentlyEdited = !!audit;
            const isNew =
              new Date(item.created_at) > cutoffDate && item.scope === "agent";

            return (
              <div key={item.id}>
                <Link
                  href={`/dashboard/knowledge/${item.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/30"
                >
                  <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-foreground">
                    {item.title}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {isNew && (
                      <span className="text-[10px] font-medium text-accent-emerald">
                        New
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground/60">
                      {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                    </span>
                    {wasRecentlyEdited && (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full bg-accent-blue",
                        )}
                        title="Agent edited recently"
                      />
                    )}
                  </span>
                </Link>
                {audit?.summary && (
                  <p className="ml-8 text-[11px] text-muted-foreground/70 truncate">
                    {audit.summary}
                  </p>
                )}
              </div>
            );
          })}
          {items.length > MAX_ITEMS && (
            <Link
              href={`/dashboard/knowledge?scope=${agentId}`}
              className="block px-2 pt-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Show all ({items.length})
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
