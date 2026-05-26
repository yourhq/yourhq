"use client";

import { useState, useEffect, useCallback } from "react";
import type { AuditLogEntry } from "@/lib/audit/types";
import { fetchActivityStream } from "../actions/activity";

const PAGE_SIZE = 20;

export function useActivityStream() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchActivityStream(0, PAGE_SIZE).then((result) => {
      if (cancelled) return;
      setEntries(result.entries);
      setHasMore(result.hasMore);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const result = await fetchActivityStream(entries.length, PAGE_SIZE);
    setEntries((prev) => [...prev, ...result.entries]);
    setHasMore(result.hasMore);
    setLoadingMore(false);
  }, [entries.length, hasMore, loadingMore]);

  return { entries, loading, loadingMore, hasMore, loadMore };
}
