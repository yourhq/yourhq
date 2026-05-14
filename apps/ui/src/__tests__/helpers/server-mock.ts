import { vi } from "vitest";
import { createMockSupabaseClient, type MockSupabaseClient } from "./supabase-mock";

let _serverClient: MockSupabaseClient | null = null;
let _adminClient: MockSupabaseClient | null = null;

export function getServerClient(): MockSupabaseClient {
  if (!_serverClient) _serverClient = createMockSupabaseClient();
  return _serverClient;
}

export function getAdminClient(): MockSupabaseClient {
  if (!_adminClient) _adminClient = createMockSupabaseClient();
  return _adminClient;
}

export function resetServerMocks() {
  _serverClient = null;
  _adminClient = null;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => getServerClient()),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => getAdminClient()),
}));
