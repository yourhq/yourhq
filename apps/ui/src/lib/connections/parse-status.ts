// Parser for `openclaw models status --json --probe` stdout.
//
// The CLI's exact JSON shape isn't fully documented; we only know the
// keys we've observed (auth.providers, auth.oauth) and the reason codes
// (`ok`, `expired`, `missing_credential`, `invalid_expires`, etc.). This
// parser is intentionally lenient — unknown fields are ignored, missing
// fields fall back to `unknown` status. If openclaw's shape changes we
// surface "Unknown" rather than crashing the page.

import type { Connection, ConnectionStatus } from "./types";

interface RawProfile {
  provider?: string;
  profile?: string;
  profileId?: string;
  status?: string;
  reason?: string;
  expires?: number;
  expiresAt?: string;
  isDefault?: boolean;
}

const REASON_TO_STATUS: Record<string, ConnectionStatus> = {
  ok: "ok",
  expired: "expired",
  missing_credential: "missing_credential",
  invalid_expires: "invalid",
  unresolved_ref: "missing_credential",
  // Add as we observe more reasons.
};

export function parseModelsStatus(
  stdout: string | null | undefined,
  gatewayId: string,
): Connection[] {
  if (!stdout) return [];
  let doc: unknown;
  try {
    doc = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!doc || typeof doc !== "object") return [];

  const root = doc as Record<string, unknown>;
  const auth = (root.auth as Record<string, unknown> | undefined) ?? {};
  // The shapes we've seen in docs:
  //   auth.oauth: array of {provider, profile, status, reason, expires}
  //   auth.providers: object keyed by provider with {status, reason, profileId, ...}
  // We accept both, deduping by profileId.

  const out: Map<string, Connection> = new Map();
  const upsert = (raw: RawProfile) => {
    const provider = (raw.provider ?? "").trim();
    const profileName = (raw.profile ?? "default").trim() || "default";
    if (!provider) return;
    const id = raw.profileId ?? `${provider}:${profileName}`;

    const reason = raw.reason ?? raw.status ?? "unknown";
    let status: ConnectionStatus =
      REASON_TO_STATUS[reason] ?? (reason === "ok" ? "ok" : "unknown");

    let expiresAt: string | undefined = raw.expiresAt;
    if (typeof raw.expires === "number" && raw.expires > 0) {
      expiresAt = new Date(raw.expires * 1000).toISOString();
    }
    if (expiresAt && status === "ok") {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms < 0) status = "expired";
      else if (ms < 24 * 60 * 60 * 1000) status = "expiring";
    }

    out.set(id, {
      id,
      provider,
      profileName,
      gatewayId,
      status,
      statusReason: reason,
      expiresAt,
      lastCheckedAt: new Date().toISOString(),
      isDefault: !!raw.isDefault,
    });
  };

  const oauth = auth.oauth;
  if (Array.isArray(oauth)) {
    for (const entry of oauth) {
      if (entry && typeof entry === "object") upsert(entry as RawProfile);
    }
  }

  const providers = auth.providers;
  if (providers && typeof providers === "object") {
    for (const [pid, value] of Object.entries(providers)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      const profiles = v.profiles;
      if (Array.isArray(profiles)) {
        for (const p of profiles) {
          if (p && typeof p === "object") {
            upsert({ provider: pid, ...(p as RawProfile) });
          }
        }
      } else {
        // Provider-level entry without explicit profiles.
        upsert({ provider: pid, ...(v as RawProfile) });
      }
    }
  }

  return Array.from(out.values());
}
