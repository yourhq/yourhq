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

/**
 * Resolve both the branch name and gateway_id for an agent.
 */
export async function resolveAgentContext(agentSlug: string): Promise<{
  branch: string;
  gatewayId: string | undefined;
}> {
  const supabase = await createClient();

  const [wsResult, agentResult] = await Promise.all([
    supabase.from("workspace").select("slug").limit(1).maybeSingle(),
    supabase
      .from("agents")
      .select("gateway_id")
      .eq("slug", agentSlug)
      .limit(1)
      .maybeSingle(),
  ]);

  const wsSlug = (wsResult.data?.slug as string | null) ?? null;
  const branch = wsSlug ? `${wsSlug}/${agentSlug}` : agentSlug;
  const gatewayId = agentResult.data?.gateway_id ?? undefined;

  return { branch, gatewayId };
}
