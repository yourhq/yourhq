import { vi } from "vitest";
import { createMockSupabaseClient, type MockSupabaseClient } from "./supabase-mock";

type TableResponses = Record<string, { data: unknown; error: null } | { data: null; error: { message: string } }>;
type RpcResponses = Record<string, { data: unknown; error: null } | { data: null; error: { message: string } }>;

export interface HookHarnessOptions {
  tables?: TableResponses;
  rpcs?: RpcResponses;
  auth?: { user: { id: string; email: string } | null };
}

export function createHookHarness(opts: HookHarnessOptions = {}) {
  const tableMap = new Map(
    Object.entries(opts.tables ?? {}).map(([k, v]) => [k, { select: v, insert: v, update: v, delete: v }]),
  );

  const rpcMap = new Map(Object.entries(opts.rpcs ?? {}));

  const supabase = createMockSupabaseClient({
    tables: tableMap,
    rpcs: rpcMap,
    auth: opts.auth,
  });

  return { supabase };
}

export function mockSupabaseModule(supabase: MockSupabaseClient) {
  vi.mock("@/lib/supabase/client", () => ({
    createClient: () => supabase,
  }));
}
