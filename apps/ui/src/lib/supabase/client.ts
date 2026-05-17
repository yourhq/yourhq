import { createBrowserClient } from "@supabase/ssr";
import { getHqConfig } from "@/lib/workspaces/hq-config-provider";

const SSR_PLACEHOLDER_URL = "https://ssr-placeholder.invalid";
const SSR_PLACEHOLDER_KEY = "ssr-placeholder-not-a-real-key-ssr-placeholder";

function storageKeyFor(workspaceId: string): string {
  return `hq-auth:${workspaceId}`;
}

function cookieNameFor(workspaceId: string): string {
  return `hq-${workspaceId.slice(0, 8)}`;
}

export function createClient() {
  if (typeof window === "undefined") {
    return createBrowserClient(SSR_PLACEHOLDER_URL, SSR_PLACEHOLDER_KEY);
  }

  const config = getHqConfig();
  if (!config) {
    return createBrowserClient(SSR_PLACEHOLDER_URL, SSR_PLACEHOLDER_KEY);
  }

  return createBrowserClient(config.url, config.anonKey, {
    cookieOptions: {
      name: cookieNameFor(config.workspaceId),
    },
  });
}

export function getSessionStorageKey(workspaceId: string): string {
  return storageKeyFor(workspaceId);
}

export function hasStoredSession(workspaceId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKeyFor(workspaceId)) !== null;
  } catch {
    return false;
  }
}
