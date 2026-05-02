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
        .limit(20);

      if (connectionId) {
        q = q.eq("connection_id", connectionId);
      }

      const { data } = await q;
      setSyncRuns(data ?? []);
    },
    [supabase],
  );

  useEffect(() => {
    fetchConnections();
    fetchSyncRuns();
  }, [fetchConnections, fetchSyncRuns]);

  useRealtime({
    table: "source_connections",
    onPayload: () => fetchConnections(),
  });

  useRealtime({
    table: "source_sync_runs",
    onPayload: () => fetchSyncRuns(),
  });

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

      await logAudit(supabase, {
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

      await logAudit(supabase, {
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

  return {
    connections,
    syncRuns,
    loading,
    actions: {
      createConnection,
      deleteConnection,
      updateConnection,
      triggerSync,
      fetchSyncRuns,
    },
  };
}
