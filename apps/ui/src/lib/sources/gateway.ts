import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

interface GatewayFilesApiResult {
  url: string | null;
  token: string | null;
  error: string | null;
}

export async function resolveGatewayFilesApi(): Promise<GatewayFilesApiResult> {
  const supabase = await createAdminClient();

  const { data: gateways } = await supabase
    .from("gateways")
    .select("meta")
    .eq("status", "ready")
    .order("last_seen_at", { ascending: false })
    .limit(1);

  if (!gateways?.length) {
    return { url: null, token: null, error: "No gateway is currently online" };
  }

  const meta = gateways[0].meta as Record<string, unknown> | null;
  const reachable = meta?.reachable_urls as Record<string, string> | undefined;
  const filesApi = reachable?.files_api;

  if (!filesApi) {
    return { url: null, token: null, error: "Gateway does not expose a files API URL" };
  }

  const token = process.env.GATEWAY_AUTH_TOKEN ?? "";

  return { url: filesApi.replace(/\/+$/, ""), token, error: null };
}
