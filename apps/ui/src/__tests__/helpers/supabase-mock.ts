import { vi } from "vitest";

type SupabaseResponse<T = unknown> = { data: T; error: null } | { data: null; error: { message: string; code?: string } };

interface MockTableConfig {
  select?: SupabaseResponse;
  insert?: SupabaseResponse;
  update?: SupabaseResponse;
  upsert?: SupabaseResponse;
  delete?: SupabaseResponse;
}

interface MockConfig {
  tables: Map<string, MockTableConfig>;
  rpcs: Map<string, SupabaseResponse>;
  auth: {
    user: { id: string; email: string } | null;
  };
}

function createQueryBuilder(config: MockConfig, table: string) {
  const tableConfig = config.tables.get(table) ?? {};

  const builder: Record<string, unknown> = {};
  const chainMethods = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "like",
    "ilike",
    "is",
    "in",
    "not",
    "or",
    "filter",
    "match",
    "order",
    "limit",
    "range",
    "textSearch",
    "contains",
    "containedBy",
    "overlaps",
    "throwOnError",
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  const selectResponse = tableConfig.select ?? { data: [], error: null };
  const insertResponse = tableConfig.insert ?? { data: [], error: null };
  const updateResponse = tableConfig.update ?? { data: [], error: null };
  const deleteResponse = tableConfig.delete ?? { data: [], error: null };

  builder.select = vi.fn().mockReturnValue(builder);
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.upsert = vi.fn().mockReturnValue(builder);
  builder.delete = vi.fn().mockReturnValue(builder);

  builder.single = vi.fn().mockImplementation(() => {
    const resp = selectResponse;
    if (resp.data && Array.isArray(resp.data) && resp.data.length > 0) {
      return Promise.resolve({ data: resp.data[0], error: null });
    }
    if (resp.data && Array.isArray(resp.data) && resp.data.length === 0) {
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve(resp);
  });

  builder.maybeSingle = vi.fn().mockImplementation(() => {
    const resp = selectResponse;
    if (resp.error) {
      return Promise.resolve({ data: null, error: resp.error });
    }
    if (resp.data && Array.isArray(resp.data) && resp.data.length > 0) {
      return Promise.resolve({ data: resp.data[0], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  // Make the builder thenable so `await supabase.from().select()` works
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    // Determine response based on last mutating call
    const response = selectResponse;
    return Promise.resolve(response).then(resolve, reject);
  };

  // Override mutating methods to return their respective responses
  const origInsert = builder.insert as ReturnType<typeof vi.fn>;
  builder.insert = vi.fn().mockImplementation((...args: unknown[]) => {
    origInsert(...args);
    const mutBuilder = { ...builder };
    mutBuilder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(insertResponse).then(resolve, reject);
    mutBuilder.select = vi.fn().mockReturnValue(mutBuilder);
    mutBuilder.single = vi.fn().mockImplementation(() => {
      if (insertResponse.data && Array.isArray(insertResponse.data) && insertResponse.data.length > 0) {
        return Promise.resolve({ data: insertResponse.data[0], error: null });
      }
      return Promise.resolve(insertResponse);
    });
    return mutBuilder;
  });

  const origUpdate = builder.update as ReturnType<typeof vi.fn>;
  builder.update = vi.fn().mockImplementation((...args: unknown[]) => {
    origUpdate(...args);
    const mutBuilder = { ...builder };
    mutBuilder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(updateResponse).then(resolve, reject);
    for (const m of chainMethods) {
      if (m !== "update" && m !== "insert" && m !== "delete") {
        mutBuilder[m] = vi.fn().mockReturnValue(mutBuilder);
      }
    }
    return mutBuilder;
  });

  const origDelete = builder.delete as ReturnType<typeof vi.fn>;
  builder.delete = vi.fn().mockImplementation((...args: unknown[]) => {
    origDelete(...args);
    const mutBuilder = { ...builder };
    mutBuilder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(deleteResponse).then(resolve, reject);
    for (const m of chainMethods) {
      if (m !== "update" && m !== "insert" && m !== "delete") {
        mutBuilder[m] = vi.fn().mockReturnValue(mutBuilder);
      }
    }
    return mutBuilder;
  });

  return builder;
}

export function createMockSupabaseClient(overrides?: Partial<MockConfig>) {
  const config: MockConfig = {
    tables: overrides?.tables ?? new Map(),
    rpcs: overrides?.rpcs ?? new Map(),
    auth: overrides?.auth ?? { user: { id: "test-user-id", email: "test@example.com" } },
  };

  const client = {
    from: vi.fn((table: string) => createQueryBuilder(config, table)),
    rpc: vi.fn((fn: string, params?: Record<string, unknown>) => {
      const response = config.rpcs.get(fn) ?? { data: null, error: null };
      const rpcBuilder: Record<string, unknown> = {
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(response).then(resolve, reject),
        single: vi.fn().mockResolvedValue(response),
        maybeSingle: vi.fn().mockResolvedValue(response),
        throwOnError: vi.fn().mockReturnValue({
          then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
            Promise.resolve(response).then(resolve, reject),
        }),
      };
      void params;
      return rpcBuilder;
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue(
        config.auth.user
          ? { data: { user: config.auth.user }, error: null }
          : { data: { user: null }, error: { message: "Not authenticated" } },
      ),
      getSession: vi.fn().mockResolvedValue(
        config.auth.user
          ? { data: { session: { user: config.auth.user } }, error: null }
          : { data: { session: null }, error: null },
      ),
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: config.auth.user }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: "test" }, error: null }),
        download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://example.com/file" } }),
      }),
    },
    _config: config,
  };

  return client;
}

export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>;
