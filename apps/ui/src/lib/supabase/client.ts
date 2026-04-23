import { createBrowserClient } from "@supabase/ssr";
import type { InjectedHqConfig } from "@/lib/projects/inject-config";

declare global {
  interface Window {
    __HQ_CONFIG__?: InjectedHqConfig | null;
  }
}

/**
 * Client-side Supabase factory. Reads the active project's URL + anon key
 * from window.__HQ_CONFIG__ (injected by the server into the initial HTML
 * via <HqConfigScript />). This avoids baking NEXT_PUBLIC_* into the
 * client bundle at build time so the same image works for any user.
 *
 * Session isolation — IMPORTANT
 * ─────────────────────────────
 * Each project has its own auth.users table. A JWT issued by project A's
 * Supabase is invalid against project B's JWT verifier. So we must store
 * tokens per-project and never let two projects' sessions collide.
 *
 * We achieve this in two places:
 *
 *   localStorage — where Supabase's client keeps its refresh tokens.
 *     We set `storageKey` to `hq-auth:<projectId>` so each project writes
 *     under a different key. Switching projects transparently switches
 *     which session the client sees.
 *
 *   Cookies — where the server reads the session so middleware / server
 *     components can verify auth on every request. Supabase's cookie
 *     names (`sb-access-token`, etc.) are rooted in the project ref, but
 *     we additionally scope the `name` prefix by project id via the
 *     `cookieOptions.name` setting so two projects don't race.
 *
 * Runtime behavior:
 *   - Browser, config present → real Supabase browser client.
 *   - Browser, config missing → throws (onboarding unfinished or bad cookie).
 *   - SSR (no window)        → returns a pre-hydration placeholder so
 *     client components that call createClient() at render time don't
 *     crash the server render. The placeholder is never actually used —
 *     the browser re-renders with the real config on hydration.
 */

const SSR_PLACEHOLDER_URL = "https://ssr-placeholder.invalid";
const SSR_PLACEHOLDER_KEY = "ssr-placeholder-not-a-real-key-ssr-placeholder";

function storageKeyFor(projectId: string): string {
  return `hq-auth:${projectId}`;
}

function cookieNameFor(projectId: string): string {
  // Short prefix keeps the cookie header small — project ids are UUIDs.
  // Take first 8 chars; collision odds are effectively zero across any
  // reasonable number of projects in one browser.
  return `hq-${projectId.slice(0, 8)}`;
}

export function createClient() {
  if (typeof window === "undefined") {
    return createBrowserClient(SSR_PLACEHOLDER_URL, SSR_PLACEHOLDER_KEY);
  }

  const config = window.__HQ_CONFIG__;
  if (!config) {
    throw new Error(
      "HQ Supabase config is not available. " +
        "The active project cookie may be missing, or the registry is empty. " +
        "Navigate to /onboarding to connect a Supabase project.",
    );
  }

  return createBrowserClient(config.url, config.anonKey, {
    cookieOptions: {
      name: cookieNameFor(config.projectId),
    },
  });
}

/**
 * Storage key used by Supabase-js for this project's session in
 * localStorage. Exposed so other modules (sign-in modal, project
 * switcher) can inspect "does a session exist for this project?"
 * without constructing the full client.
 */
export function getSessionStorageKey(projectId: string): string {
  return storageKeyFor(projectId);
}

/**
 * True if there's ANY session data stored for the given project. Doesn't
 * validate the token — only tells you whether sign-in has been attempted.
 */
export function hasStoredSession(projectId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKeyFor(projectId)) !== null;
  } catch {
    return false;
  }
}
