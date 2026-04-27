// Parses + validates a Supabase project URL.
//
// Cloud-hosted projects look like:
//   https://abcdefghijklmnop.supabase.co
//
// We need the project ref (the leading subdomain) to deep-link the user
// to their API keys page:
//   https://supabase.com/dashboard/project/<ref>/settings/api-keys
//
// Self-hosted Supabase URLs are user-defined and can be anything. We
// accept any well-formed http(s) URL but only extract a ref if the host
// matches *.supabase.co.

export interface ParsedSupabaseUrl {
  ok: boolean;
  url?: string;        // normalized (no trailing slash)
  ref?: string;        // project ref if we can extract one
  isCloudHosted?: boolean;
  error?: string;
}

export function parseSupabaseUrl(input: string): ParsedSupabaseUrl {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Project URL is empty." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: "That doesn't look like a URL. Expected https://xxx.supabase.co.",
    };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      ok: false,
      error: "URL must start with https:// (or http:// for self-hosted).",
    };
  }

  const host = parsed.hostname;
  const isCloudHosted = /\.supabase\.co$/i.test(host);
  const cloudMatch = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  const ref = cloudMatch ? cloudMatch[1] : undefined;

  // Cloud-hosted but malformed (e.g. www.supabase.co)
  if (isCloudHosted && !ref) {
    return {
      ok: false,
      error: "That URL doesn't include a project subdomain.",
    };
  }

  // Build the normalized URL — strip trailing slash, drop path/search.
  const normalized = `${parsed.protocol}//${parsed.host}`;

  return {
    ok: true,
    url: normalized,
    ref,
    isCloudHosted,
  };
}

/**
 * Build the deep-link to a project's API Keys settings page on the
 * Supabase dashboard. Returns null for self-hosted URLs (no shared
 * dashboard to link to).
 */
export function apiKeysDashboardUrl(ref: string | undefined): string | null {
  if (!ref) return null;
  return `https://supabase.com/dashboard/project/${ref}/settings/api-keys`;
}
