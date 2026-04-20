import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { VisibilityState } from "@tanstack/react-table";
import { ColumnConfig, ColumnToggleItem } from "@/lib/columns/types";

function storageKey(entityType: string) {
  return `columns-${entityType}`;
}

function readStored(entityType: string): Record<string, boolean> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(entityType));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(entityType: string, state: Record<string, boolean>) {
  try {
    localStorage.setItem(storageKey(entityType), JSON.stringify(state));
  } catch {
    // localStorage full or unavailable
  }
}

export function useColumnVisibility<T>(
  entityType: string,
  columnConfigs: ColumnConfig<T>[]
) {
  const configIds = columnConfigs.map((c) => c.id).join(",");
  const initializedRef = useRef(false);

  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    const stored = readStored(entityType);
    const result: Record<string, boolean> = {};
    for (const config of columnConfigs) {
      if (config.locked) {
        result[config.id] = true;
      } else if (stored && config.id in stored) {
        result[config.id] = stored[config.id];
      } else {
        result[config.id] = config.defaultVisible;
      }
    }
    return result;
  });

  // Re-merge when configs change (e.g. new custom field added)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    setVisibility((prev) => {
      const result: Record<string, boolean> = {};
      for (const config of columnConfigs) {
        if (config.locked) {
          result[config.id] = true;
        } else if (config.id in prev) {
          result[config.id] = prev[config.id];
        } else {
          result[config.id] = config.defaultVisible;
        }
      }
      return result;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configIds]);

  const columnVisibility: VisibilityState = useMemo(() => {
    const state: VisibilityState = {};
    for (const config of columnConfigs) {
      state[config.columnDef.id ?? (config.columnDef as { accessorKey?: string }).accessorKey ?? config.id] =
        visibility[config.id] ?? config.defaultVisible;
    }
    return state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibility, configIds]);

  const toggleColumn = useCallback(
    (columnId: string) => {
      setVisibility((prev) => {
        const config = columnConfigs.find((c) => c.id === columnId);
        if (config?.locked) return prev;
        const next = { ...prev, [columnId]: !prev[columnId] };
        writeStored(entityType, next);
        return next;
      });
    },
    [columnConfigs, entityType]
  );

  const resetToDefaults = useCallback(() => {
    const result: Record<string, boolean> = {};
    for (const config of columnConfigs) {
      result[config.id] = config.locked ? true : config.defaultVisible;
    }
    setVisibility(result);
    try {
      localStorage.removeItem(storageKey(entityType));
    } catch {
      // ignore
    }
  }, [columnConfigs, entityType]);

  const toggleItems: ColumnToggleItem[] = useMemo(
    () =>
      columnConfigs
        .filter((c) => c.id !== "actions")
        .map((c) => ({
          id: c.id,
          label: c.label,
          visible: visibility[c.id] ?? c.defaultVisible,
          locked: c.locked ?? false,
          group: c.group,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibility, configIds]
  );

  return { columnVisibility, toggleColumn, resetToDefaults, toggleItems };
}
