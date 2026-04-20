"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AgentListItem {
  id: string;
  slug: string;
  name: string;
}

/** Lightweight hook that fetches agent slugs and names for display purposes. */
export function useAgentsList() {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from("agents")
      .select("id, slug, name")
      .order("name", { ascending: true });
    if (data) setAgents(data as AgentListItem[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetch();
  }, [fetch]);

  const agentMap = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.slug, a.name])),
    [agents]
  );

  return { agents, loading, agentMap };
}
