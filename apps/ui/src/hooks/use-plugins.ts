"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "./use-realtime";
import {
  listPlugins,
  togglePlugin as togglePluginAction,
  deletePlugin as deletePluginAction,
} from "@/app/dashboard/settings/plugins/actions";
import type { HQPlugin } from "@/lib/plugins/types";

export function usePlugins(initialPlugins?: HQPlugin[]) {
  const [plugins, setPlugins] = useState<HQPlugin[]>(initialPlugins ?? []);
  const [loading, setLoading] = useState(!initialPlugins);

  const refetch = useCallback(async () => {
    const r = await listPlugins();
    if (r.ok && r.data) setPlugins(r.data.plugins);
  }, []);

  useEffect(() => {
    if (!initialPlugins) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      refetch().finally(() => setLoading(false));
    }
  }, [initialPlugins, refetch]);

  useRealtime({
    table: "hq_plugins",
    onPayload: () => {
      void refetch();
    },
  });

  const toggleEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      const r = await togglePluginAction(id, enabled);
      if (r.ok) void refetch();
      return r;
    },
    [refetch],
  );

  const remove = useCallback(
    async (id: string) => {
      const r = await deletePluginAction(id);
      if (r.ok) void refetch();
      return r;
    },
    [refetch],
  );

  return { plugins, loading, refetch, toggleEnabled, remove };
}
