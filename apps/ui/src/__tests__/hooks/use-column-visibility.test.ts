import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ColumnConfig } from "@/lib/columns/types";

type Dummy = { id: string };

function makeConfig(
  id: string,
  opts: Partial<ColumnConfig<Dummy>> = {},
): ColumnConfig<Dummy> {
  return {
    id,
    label: id,
    defaultVisible: true,
    group: "standard",
    columnDef: { id, header: id },
    ...opts,
  };
}

let storageBacking: Record<string, string> = {};

beforeEach(() => {
  storageBacking = {};
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => storageBacking[key] ?? null),
    setItem: vi.fn((key: string, val: string) => {
      storageBacking[key] = val;
    }),
    removeItem: vi.fn((key: string) => {
      delete storageBacking[key];
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useColumnVisibility", () => {
  it("returns default visibility when localStorage is empty", async () => {
    const { useColumnVisibility } = await import(
      "@/hooks/use-column-visibility"
    );
    const configs = [
      makeConfig("name", { defaultVisible: true }),
      makeConfig("email", { defaultVisible: false }),
      makeConfig("phone", { defaultVisible: true }),
    ];

    const { result } = renderHook(() =>
      useColumnVisibility("contacts", configs),
    );

    expect(result.current.columnVisibility).toEqual({
      name: true,
      email: false,
      phone: true,
    });
  });

  it("restores visibility from localStorage", async () => {
    storageBacking["columns-contacts"] = JSON.stringify({
      name: true,
      email: true,
      phone: false,
    });

    const { useColumnVisibility } = await import(
      "@/hooks/use-column-visibility"
    );
    const configs = [
      makeConfig("name", { defaultVisible: true }),
      makeConfig("email", { defaultVisible: false }),
      makeConfig("phone", { defaultVisible: true }),
    ];

    const { result } = renderHook(() =>
      useColumnVisibility("contacts", configs),
    );

    expect(result.current.columnVisibility).toEqual({
      name: true,
      email: true,
      phone: false,
    });
  });

  it("persists toggle changes to localStorage", async () => {
    const { useColumnVisibility } = await import(
      "@/hooks/use-column-visibility"
    );
    const configs = [
      makeConfig("name", { defaultVisible: true }),
      makeConfig("email", { defaultVisible: false }),
    ];

    const { result } = renderHook(() =>
      useColumnVisibility("contacts", configs),
    );

    act(() => {
      result.current.toggleColumn("email");
    });

    expect(result.current.columnVisibility.email).toBe(true);
    const stored = JSON.parse(storageBacking["columns-contacts"]);
    expect(stored.email).toBe(true);
  });

  it("prevents toggling locked columns", async () => {
    const { useColumnVisibility } = await import(
      "@/hooks/use-column-visibility"
    );
    const configs = [
      makeConfig("name", { defaultVisible: true, locked: true }),
      makeConfig("email", { defaultVisible: false }),
    ];

    const { result } = renderHook(() =>
      useColumnVisibility("contacts", configs),
    );

    act(() => {
      result.current.toggleColumn("name");
    });

    expect(result.current.columnVisibility.name).toBe(true);
  });

  it("locked columns are always true regardless of stored state", async () => {
    storageBacking["columns-contacts"] = JSON.stringify({
      name: false,
      email: false,
    });

    const { useColumnVisibility } = await import(
      "@/hooks/use-column-visibility"
    );
    const configs = [
      makeConfig("name", { defaultVisible: true, locked: true }),
      makeConfig("email", { defaultVisible: false }),
    ];

    const { result } = renderHook(() =>
      useColumnVisibility("contacts", configs),
    );

    expect(result.current.columnVisibility.name).toBe(true);
    expect(result.current.columnVisibility.email).toBe(false);
  });

  it("resetToDefaults restores default visibility and clears storage", async () => {
    storageBacking["columns-contacts"] = JSON.stringify({
      name: false,
      email: true,
    });

    const { useColumnVisibility } = await import(
      "@/hooks/use-column-visibility"
    );
    const configs = [
      makeConfig("name", { defaultVisible: true }),
      makeConfig("email", { defaultVisible: false }),
    ];

    const { result } = renderHook(() =>
      useColumnVisibility("contacts", configs),
    );

    expect(result.current.columnVisibility.email).toBe(true);

    act(() => {
      result.current.resetToDefaults();
    });

    expect(result.current.columnVisibility).toEqual({
      name: true,
      email: false,
    });
    expect(storageBacking["columns-contacts"]).toBeUndefined();
  });

  it("toggleItems excludes actions column and reflects current state", async () => {
    const { useColumnVisibility } = await import(
      "@/hooks/use-column-visibility"
    );
    const configs = [
      makeConfig("name", { defaultVisible: true }),
      makeConfig("actions", { defaultVisible: true }),
    ];

    const { result } = renderHook(() =>
      useColumnVisibility("contacts", configs),
    );

    const ids = result.current.toggleItems.map((i) => i.id);
    expect(ids).toContain("name");
    expect(ids).not.toContain("actions");
  });

  it("uses different storage keys for different entity types", async () => {
    const { useColumnVisibility } = await import(
      "@/hooks/use-column-visibility"
    );
    const configs = [makeConfig("col1")];

    const { result: r1 } = renderHook(() =>
      useColumnVisibility("contacts", configs),
    );
    const { result: r2 } = renderHook(() =>
      useColumnVisibility("tasks", configs),
    );

    act(() => {
      r1.current.toggleColumn("col1");
    });

    expect(storageBacking["columns-contacts"]).toBeDefined();
    expect(storageBacking["columns-tasks"]).toBeUndefined();
  });
});
