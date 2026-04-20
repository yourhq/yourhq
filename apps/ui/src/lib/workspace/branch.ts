import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the git branch name for an agent.
 * Returns `{workspace-slug}/{agent-slug}` if a workspace slug is set,
 * otherwise just the agent slug.
 */
export async function resolveAgentBranch(agentSlug: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspace")
    .select("slug")
    .limit(1)
    .maybeSingle();

  const wsSlug = (data?.slug as string | null) ?? null;
  return wsSlug ? `${wsSlug}/${agentSlug}` : agentSlug;
}
