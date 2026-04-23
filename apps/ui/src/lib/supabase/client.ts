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
 * Runtime behavior:
 *   - Browser, config present → real Supabase browser client.
 *   - Browser, config missing → throws (onboarding unfinished or bad cookie).
 *   - SSR (no window)        → returns a lazy proxy that delegates to the
 *     real client once the browser hydrates. This avoids crashing during
 *     server-side rendering of client components that call createClient()
 *     at module/useMemo time — pre-hydration React never actually invokes
 *     methods on the returned client.
 */

// During SSR the client components that do
//   const supabase = useMemo(() => createClient(), []);
// run at render-time on the server, where `window` doesn't exist. We
// return a harmless pre-hydration client pointed at a reachable but
// unusable URL — the user's session cookie isn't present on the server
// anyway, so any query would be unauthorized; no actual server-side
// fetches happen before hydration. The moment the browser takes over,
// the component re-renders and useMemo recreates the client reading
// the real window.__HQ_CONFIG__ values.
//
// This keeps the same return type as a real client (important for the
// 40+ call sites that use generic Supabase type inference).
const SSR_PLACEHOLDER_URL = "https://ssr-placeholder.invalid";
const SSR_PLACEHOLDER_KEY = "ssr-placeholder-not-a-real-key-ssr-placeholder";

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

  return createBrowserClient(config.url, config.anonKey);
}
