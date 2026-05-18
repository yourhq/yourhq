"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/notifications/types";
import { useRealtimeSync } from "./use-realtime-sync";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

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
    if (error) {
      toast.error("Failed to load notifications");
    } else if (data) {
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
    () => notifications.filter((n) => !n.read_at).length,
    [notifications]
  );

  const markAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n
        )
      );
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === id ? { ...n, read_at: null } : n
          )
        );
        toast.error("Failed to mark notification as read");
      }
    },
    [supabase]
  );

  const markAllRead = useCallback(async () => {
    const previousState = notifications;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))
    );
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .is("read_at", null);
    if (error) {
      setNotifications(previousState);
      toast.error("Failed to mark all as read");
    }
  }, [supabase, notifications]);

  const dismiss = useCallback(
    async (id: string) => {
      const dismissed = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      const { error } = await supabase
        .from("notifications")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        if (dismissed) {
          setNotifications((prev) => [dismissed, ...prev].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          ));
        }
        toast.error("Failed to dismiss notification");
      }
    },
    [supabase, notifications]
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
 * Uses realtime subscription for instant updates instead of polling.
 */
export function useUnreadNotificationCount() {
  const [count, setCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);

  const fetchCount = useCallback(async () => {
    const { count: c } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .is("read_at", null)
      .is("dismissed_at", null);
    setCount(c ?? 0);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCount();
  }, [fetchCount]);

  useRealtime({
    table: "notifications",
    onPayload: fetchCount,
  });

  return { count, refresh: fetchCount };
}
