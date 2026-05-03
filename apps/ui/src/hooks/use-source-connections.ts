"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  SourceConnection,
  SourceSyncRun,
  SourceProvider,
} from "@/lib/sources/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

export interface SourceKnowledgeItem {
  id: string;
  title: string;
  kind: string;
  source_external_id: string | null;
  source_sync_status: string | null;
  source_synced_at: string | null;
  content_hash: string | null;
  created_at: string;
}

export function useSourceConnections() {
  const [connections, setConnections] = useState<SourceConnection[]>([]);
  const [syncRuns, setSyncRuns] = useState<SourceSyncRun[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const fetchConnections = useCallback(async () => {
    const { data } = await supabase
      .from("source_connections")
      .select("*")
      .order("created_at", { ascending: false });
    setConnections(data ?? []);
    setLoading(false);
  }, [supabase]);

  const fetchSyncRuns = useCallback(
    async (connectionId?: string) => {
      let q = supabase
        .from("source_sync_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (connectionId) {
        q = q.eq("connection_id", connectionId);
      }

      const { data } = await q;
      setSyncRuns(data ?? []);
    },
    [supabase],
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchConnections();
    fetchSyncRuns();
  }, [fetchConnections, fetchSyncRuns]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useRealtime({
    table: "source_connections",
    onPayload: () => fetchConnections(),
  });

  useRealtime({
    table: "source_sync_runs",
    onPayload: () => fetchSyncRuns(),
  });

  const getConnection = useCallback(
    (id: string) => connections.find((c) => c.id === id) ?? null,
    [connections],
  );

  const createConnection = useCallback(
    async (input: {
      provider: SourceProvider;
      account_label: string;
      credentials: Record<string, unknown>;
      sync_interval_hours?: number;
    }): Promise<SourceConnection | null> => {
      const { data, error } = await supabase
        .from("source_connections")
        .insert({
          provider: input.provider,
          account_label: input.account_label,
          credentials: input.credentials,
          sync_interval_hours: input.sync_interval_hours ?? 6,
          next_sync_at: new Date().toISOString(),
          last_verified_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        return null;
      }

      logAudit(supabase, {
        module: "knowledge",
        entity_type: "source_connection",
        entity_id: data.id,
        action: "created",
        summary: `Connected ${input.provider}: ${input.account_label}`,
      });

      toast.success(`Connected to ${input.account_label}`);
      fetchConnections();
      return data;
    },
    [supabase, fetchConnections],
  );

  const deleteConnection = useCallback(
    async (id: string) => {
      const conn = connections.find((c) => c.id === id);
      const { error } = await supabase
        .from("source_connections")
        .delete()
        .eq("id", id);

      if (error) {
        toast.error(error.message);
        return;
      }

      logAudit(supabase, {
        module: "knowledge",
        entity_type: "source_connection",
        entity_id: id,
        action: "deleted",
        summary: `Disconnected ${conn?.provider}: ${conn?.account_label}`,
      });

      toast.success("Connection removed");
      fetchConnections();
    },
    [supabase, connections, fetchConnections],
  );

  const updateConnection = useCallback(
    async (
      id: string,
      updates: Partial<Pick<SourceConnection, "account_label" | "sync_interval_hours" | "status" | "credentials">>,
    ) => {
      const { error } = await supabase
        .from("source_connections")
        .update(updates)
        .eq("id", id);

      if (error) {
        toast.error(error.message);
        return;
      }

      fetchConnections();
    },
    [supabase, fetchConnections],
  );

  const triggerSync = useCallback(
    async (connectionId: string) => {
      const { error } = await supabase
        .from("source_connections")
        .update({ next_sync_at: new Date().toISOString() })
        .eq("id", connectionId);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Sync triggered");
    },
    [supabase],
  );

  const fetchConnectionItems = useCallback(
    async (connectionId: string): Promise<SourceKnowledgeItem[]> => {
      const { data } = await supabase
        .from("knowledge_items")
        .select("id, title, kind, source_external_id, source_sync_status, source_synced_at, content_hash, created_at")
        .eq("source_connection_id", connectionId)
        .is("archived_at", null)
        .order("title", { ascending: true });
      return (data ?? []) as SourceKnowledgeItem[];
    },
    [supabase],
  );

  const addSyncItems = useCallback(
    async (
      connectionId: string,
      items: Array<{ external_id: string; title: string; source_url: string }>,
    ): Promise<boolean> => {
      const conn = connections.find((c) => c.id === connectionId);
      const provider = conn?.provider;
      const rows = items.map((item) => ({
        kind: "source",
        title: item.title,
        scope: "workspace",
        source_connection_id: connectionId,
        source_external_id: item.external_id,
        source_sync_status: "stale",
        processing_status: "done",
        embedding_status: "pending",
        meta: { source_url: item.source_url, provider },
      }));

      const { error } = await supabase
        .from("knowledge_items")
        .insert(rows);

      if (error) {
        toast.error(error.message);
        return false;
      }

      logAudit(supabase, {
        module: "knowledge",
        entity_type: "source_connection",
        entity_id: connectionId,
        action: "updated",
        summary: `Added ${items.length} item(s) to sync`,
      });

      toast.success(`${items.length} item(s) added to sync`);

      await supabase
        .from("source_connections")
        .update({ next_sync_at: new Date().toISOString() })
        .eq("id", connectionId);

      return true;
    },
    [supabase, connections],
  );

  const stopSyncingItem = useCallback(
    async (itemId: string) => {
      const { error } = await supabase
        .from("knowledge_items")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", itemId);

      if (error) {
        toast.error(error.message);
        return;
      }

      logAudit(supabase, {
        module: "knowledge",
        entity_type: "knowledge_item",
        entity_id: itemId,
        action: "deleted",
        summary: "Stopped syncing source item",
      });

      toast.success("Item removed from sync");
    },
    [supabase],
  );

  const syncItemNow = useCallback(
    async (itemId: string) => {
      const { error } = await supabase
        .from("knowledge_items")
        .update({
          source_sync_status: "stale",
          embedding_status: "pending",
        })
        .eq("id", itemId);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Item queued for sync");
    },
    [supabase],
  );

  return {
    connections,
    syncRuns,
    loading,
    getConnection,
    actions: {
      createConnection,
      deleteConnection,
      updateConnection,
      triggerSync,
      fetchSyncRuns,
      fetchConnectionItems,
      addSyncItems,
      stopSyncingItem,
      syncItemNow,
    },
  };
}
