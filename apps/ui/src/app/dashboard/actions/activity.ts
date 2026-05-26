"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/require-auth";
import type { AuditLogEntry } from "@/lib/audit/types";
import type { ActivityStreamResult } from "@/lib/types/dashboard";

export async function fetchActivityStream(
  offset: number = 0,
  limit: number = 20,
): Promise<ActivityStreamResult> {
  await requireAuth();
  const clampedLimit = Math.min(Math.max(limit, 1), 100);
  const clampedOffset = Math.max(offset, 0);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select("*, actor_agent:agents(id, name, slug, avatar_url, meta)")
    .order("created_at", { ascending: false })
    .range(clampedOffset, clampedOffset + clampedLimit - 1);

  if (error) {
    console.error("[activity] fetchActivityStream failed:", error.message);
    return { entries: [], hasMore: false };
  }

  const entries = (data as AuditLogEntry[] | null) ?? [];
  return {
    entries,
    hasMore: entries.length === clampedLimit,
  };
}
