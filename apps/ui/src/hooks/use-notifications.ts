"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/notifications/types";
import { useRealtimeSync } from "./use-realtime-sync";

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) {
      setNotifications(data as Notification[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
  }, [fetchNotifications]);

  useRealtimeSync<Notification>({
    table: "notifications",
    select: "*",
    items: notifications,
    setItems: setNotifications,
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const markAsRead = useCallback(
    async (id: string) => {
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id);
      // Realtime will sync
    },
    [supabase]
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: now })
      .eq("is_read", false);
  }, [supabase]);

  const dismiss = useCallback(
    async (id: string) => {
      await supabase
        .from("notifications")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    },
    [supabase]
  );

  return {
    notifications,
    unreadCount,
    loading,
    refresh: fetchNotifications,
    markAsRead,
    markAllRead,
    dismiss,
  };
}

/**
 * Lightweight hook that only returns the unread count — for the sidebar badge.
 * Avoids fetching the full list in the shell.
 */
export function useUnreadNotificationCount() {
  const [count, setCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  const fetchCount = useCallback(async () => {
    const { count: c } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false)
      .is("dismissed_at", null);
    setCount(c ?? 0);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCount();
    // Poll every 60s as a simple refresh strategy
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return { count, refresh: fetchCount };
}
