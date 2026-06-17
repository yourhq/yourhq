import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HQPlugin } from "@/lib/plugins/types";

const actionMocks = vi.hoisted(() => ({
  deletePlugin: vi.fn(),
  listPlugins: vi.fn(),
  togglePlugin: vi.fn(),
}));

const useRealtimeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/dashboard/settings/plugins/actions", () => actionMocks);

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: useRealtimeMock,
}));

function buildPlugin(overrides: Partial<HQPlugin> = {}): HQPlugin {
  return {
    id: "plugin-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    plugin_id: "usage-alerts",
    name: "Usage Alerts",
    description: null,
    version: "1.0.0",
    source: "builtin",
    is_enabled: true,
    hooks: ["usage.recorded"],
    entry_module: "handler.py",
    webhook_url: null,
    webhook_secret: null,
    config: {},
    config_schema: null,
    capabilities: [],
    installed_by: null,
    meta: {},
    ...overrides,
  };
}

describe("usePlugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("fetches plugins on mount", async () => {
    const plugin = buildPlugin();
    actionMocks.listPlugins.mockResolvedValueOnce({
      ok: true,
      data: { plugins: [plugin] },
    });

    const { usePlugins } = await import("@/hooks/use-plugins");
    const { result } = renderHook(() => usePlugins());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.plugins).toEqual([plugin]);
    expect(actionMocks.listPlugins).toHaveBeenCalledTimes(1);
    expect(useRealtimeMock).toHaveBeenCalledWith(
      expect.objectContaining({ table: "hq_plugins" }),
    );
  });

  it("uses initial plugins without fetching on mount", async () => {
    const plugin = buildPlugin({ id: "initial-plugin" });

    const { usePlugins } = await import("@/hooks/use-plugins");
    const { result } = renderHook(() => usePlugins([plugin]));

    expect(result.current.loading).toBe(false);
    expect(result.current.plugins).toEqual([plugin]);
    expect(actionMocks.listPlugins).not.toHaveBeenCalled();
  });

  it("keeps existing plugins when refetch fails", async () => {
    const plugin = buildPlugin();
    actionMocks.listPlugins.mockResolvedValueOnce({ ok: false, error: "boom" });

    const { usePlugins } = await import("@/hooks/use-plugins");
    const { result } = renderHook(() => usePlugins([plugin]));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.plugins).toEqual([plugin]);
  });

  it("toggles a plugin and refetches on success", async () => {
    const disabled = buildPlugin({ is_enabled: false });
    const enabled = buildPlugin({ is_enabled: true });
    actionMocks.listPlugins
      .mockResolvedValueOnce({ ok: true, data: { plugins: [disabled] } })
      .mockResolvedValueOnce({ ok: true, data: { plugins: [enabled] } });
    actionMocks.togglePlugin.mockResolvedValueOnce({ ok: true });

    const { usePlugins } = await import("@/hooks/use-plugins");
    const { result } = renderHook(() => usePlugins());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.toggleEnabled("plugin-1", true);
    });

    await waitFor(() => expect(result.current.plugins).toEqual([enabled]));
    expect(actionMocks.togglePlugin).toHaveBeenCalledWith("plugin-1", true);
    expect(actionMocks.listPlugins).toHaveBeenCalledTimes(2);
  });

  it("does not refetch when toggling fails", async () => {
    const plugin = buildPlugin();
    actionMocks.listPlugins.mockResolvedValueOnce({
      ok: true,
      data: { plugins: [plugin] },
    });
    actionMocks.togglePlugin.mockResolvedValueOnce({ ok: false, error: "denied" });

    const { usePlugins } = await import("@/hooks/use-plugins");
    const { result } = renderHook(() => usePlugins());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const out = await result.current.toggleEnabled("plugin-1", false);

    expect(out).toEqual({ ok: false, error: "denied" });
    expect(actionMocks.listPlugins).toHaveBeenCalledTimes(1);
  });

  it("removes a plugin and refetches on success", async () => {
    const plugin = buildPlugin();
    actionMocks.listPlugins
      .mockResolvedValueOnce({ ok: true, data: { plugins: [plugin] } })
      .mockResolvedValueOnce({ ok: true, data: { plugins: [] } });
    actionMocks.deletePlugin.mockResolvedValueOnce({ ok: true });

    const { usePlugins } = await import("@/hooks/use-plugins");
    const { result } = renderHook(() => usePlugins());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove("plugin-1");
    });

    await waitFor(() => expect(result.current.plugins).toEqual([]));
    expect(actionMocks.deletePlugin).toHaveBeenCalledWith("plugin-1");
    expect(actionMocks.listPlugins).toHaveBeenCalledTimes(2);
  });

  it("refetches when realtime reports a plugin table change", async () => {
    const first = buildPlugin({ id: "plugin-1", name: "First" });
    const second = buildPlugin({ id: "plugin-2", name: "Second" });
    actionMocks.listPlugins
      .mockResolvedValueOnce({ ok: true, data: { plugins: [first] } })
      .mockResolvedValueOnce({ ok: true, data: { plugins: [second] } });

    const { usePlugins } = await import("@/hooks/use-plugins");
    const { result } = renderHook(() => usePlugins());

    await waitFor(() => expect(result.current.plugins).toEqual([first]));

    const realtimeArgs = useRealtimeMock.mock.calls[0]?.[0];
    await act(async () => {
      realtimeArgs.onPayload();
    });

    await waitFor(() => expect(result.current.plugins).toEqual([second]));
  });
});
