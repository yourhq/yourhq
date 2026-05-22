import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "E2E_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export async function queryTable(
  table: string,
  filter?: Record<string, unknown>
) {
  const sb = getServiceClient();
  let query = sb.from(table).select("*");
  if (filter) {
    for (const [col, val] of Object.entries(filter)) {
      query = query.eq(col, val);
    }
  }
  const { data, error } = await query;
  if (error) throw new Error(`Query ${table} failed: ${error.message}`);
  return data;
}

export async function countRows(
  table: string,
  filter?: Record<string, unknown>
): Promise<number> {
  const sb = getServiceClient();
  let query = sb.from(table).select("*", { count: "exact", head: true });
  if (filter) {
    for (const [col, val] of Object.entries(filter)) {
      query = query.eq(col, val);
    }
  }
  const { count, error } = await query;
  if (error) throw new Error(`Count ${table} failed: ${error.message}`);
  return count ?? 0;
}

export async function deleteRows(
  table: string,
  filter: Record<string, unknown>
) {
  const sb = getServiceClient();
  let query = sb.from(table).delete();
  for (const [col, val] of Object.entries(filter)) {
    query = query.eq(col, val);
  }
  const { error } = await query;
  if (error) throw new Error(`Delete ${table} failed: ${error.message}`);
}

export async function rpc<T = unknown>(
  fn: string,
  params?: Record<string, unknown>
): Promise<T> {
  const sb = getServiceClient();
  const { data, error } = await sb.rpc(fn, params);
  if (error) throw new Error(`RPC ${fn} failed: ${error.message}`);
  return data as T;
}
