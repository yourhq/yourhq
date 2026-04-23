"use client";

// Listens for auth failures from any Supabase call and exposes "needs sign-in"
// state to the dashboard shell, which renders the inline SignInModal.
//
// Three triggers unlock the modal:
//
//   1. Initial hydration — if there's no session for the active project,
//      show the modal immediately (user just switched projects, or came
//      back after their token expired).
//
//   2. onAuthStateChange fires SIGNED_OUT or TOKEN_REFRESHED_FAILED while
//      the user is using the app — session expired mid-use.
//
//   3. Explicit trigger from a server action / API route that returns 401
//      (future: exposed via a global requireSignIn() helper).
//
// On successful sign-in, the caller calls close() which also triggers
// router.refresh() so server components re-render against the fresh cookie.

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface AuthWatcherState {
  /** True when the inline sign-in modal should be shown. */
  needsSignIn: boolean;
  /** The currently-authenticated email, or null if signed out. */
  email: string | null;
  /** Call after a successful sign-in to dismiss the modal + refresh. */
  close: () => void;
  /** Call to proactively trigger the modal (e.g., after a 401). */
  requireSignIn: () => void;
}

export function useAuthWatcher(): AuthWatcherState {
  const router = useRouter();
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  // Check initial session on mount + subscribe to auth events.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // Initial check — if no session, show the modal.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const user = data.session?.user;
      if (!user) {
        setNeedsSignIn(true);
        setEmail(null);
      } else {
        setEmail(user.email ?? null);
      }
    });

    // Subscribe to sign-in / sign-out / token refresh events.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT" || !session) {
        setNeedsSignIn(true);
        setEmail(null);
        return;
      }
      if (session?.user) {
        setNeedsSignIn(false);
        setEmail(session.user.email ?? null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const close = useCallback(() => {
    setNeedsSignIn(false);
    // Refresh server components so they pick up the new cookie-borne
    // session. This is the graceful-recovery part — no full navigation.
    router.refresh();
  }, [router]);

  const requireSignIn = useCallback(() => {
    setNeedsSignIn(true);
  }, []);

  return { needsSignIn, email, close, requireSignIn };
}
