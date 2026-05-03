"use client";

import { useCallback, useRef, useState } from "react";
import type { SourceBrowseItem } from "@/lib/sources/types";

export function useSourceBrowse() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SourceBrowseItem[]>([]);
  const childrenCache = useRef<Map<string, SourceBrowseItem[]>>(new Map());

  const browse = useCallback(
    async (
      connectionId: string,
      parentId?: string | null,
      search?: string | null,
    ): Promise<SourceBrowseItem[]> => {
      const cacheKey = search
        ? `search:${search}`
        : parentId
          ? `parent:${parentId}`
          : "root";

      if (!search && childrenCache.current.has(cacheKey)) {
        const cached = childrenCache.current.get(cacheKey)!;
        if (!parentId) setItems(cached);
        return cached;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/sources/browse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connection_id: connectionId,
            parent_id: parentId,
            search,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `Browse failed: ${res.status}`);
        }

        const data = await res.json();
        const result: SourceBrowseItem[] = data.items ?? [];

        if (!search) {
          childrenCache.current.set(cacheKey, result);
        }
        if (!parentId && !search) {
          setItems(result);
        }

        return result;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const validate = useCallback(
    async (
      provider: string,
      credentials: Record<string, unknown>,
    ): Promise<{ valid: boolean; error?: string; account_name?: string }> => {
      const res = await fetch("/api/sources/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, credentials }),
      });
      return res.json();
    },
    [],
  );

  const clearCache = useCallback(() => {
    childrenCache.current.clear();
  }, []);

  return { items, loading, browse, validate, clearCache };
}
