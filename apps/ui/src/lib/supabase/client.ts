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
 * If no project is configured yet (first-boot / onboarding), throws.
 * Callers inside the dashboard shouldn't hit this — middleware redirects
 * to /onboarding before any dashboard page loads. The exception is a
 * safety net that surfaces the bug clearly.
 */
export function createClient() {
  const config =
    typeof window !== "undefined" ? window.__HQ_CONFIG__ : null;

  if (!config) {
    throw new Error(
      "HQ Supabase config is not available. " +
        "The active project cookie may be missing, or the registry is empty. " +
        "Navigate to /onboarding to connect a Supabase project.",
    );
  }

  return createBrowserClient(config.url, config.anonKey);
}
