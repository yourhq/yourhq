import { createBrowserClient } from "@supabase/ssr";
import { getHqConfig } from "@/lib/projects/hq-config-provider";

const SSR_PLACEHOLDER_URL = "https://ssr-placeholder.invalid";
const SSR_PLACEHOLDER_KEY = "ssr-placeholder-not-a-real-key-ssr-placeholder";

function storageKeyFor(projectId: string): string {
  return `hq-auth:${projectId}`;
}

function cookieNameFor(projectId: string): string {
  return `hq-${projectId.slice(0, 8)}`;
}

export function createClient() {
  if (typeof window === "undefined") {
    return createBrowserClient(SSR_PLACEHOLDER_URL, SSR_PLACEHOLDER_KEY);
  }

  const config = getHqConfig();
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
