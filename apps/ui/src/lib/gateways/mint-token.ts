// Mints a single-use, short-lived gateway registration token. The UI
// embeds the plaintext token into a one-liner the user runs on the
// machine where the gateway should live; the gateway's install script
// calls consume_gateway_token() to exchange it for a gateway_id.
//
// We store SHA-256(token) — the plaintext is shown to the user exactly
// once (in the UI) and pasted into the terminal, never persisted
// anywhere we control.

import "server-only";
import { randomBytes, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export interface MintTokenInput {
  label?: string;
  // Minutes until the token expires. Defaults to 15.
  ttlMinutes?: number;
}

export interface MintedToken {
  token: string;       // plaintext — show once, never persist
  tokenId: string;     // row id
  expiresAt: string;   // ISO8601
}

export async function mintGatewayToken(
  input: MintTokenInput = {},
): Promise<MintedToken> {
  const supabase = await createAdminClient();

  // 24 bytes → 48-char hex → plenty of entropy, short enough to paste
  const plaintext = randomBytes(24).toString("hex");
  const tokenHash = createHash("sha256").update(plaintext).digest("hex");

  const ttl = Math.max(5, Math.min(60, input.ttlMinutes ?? 15));
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("gateway_registration_tokens")
    .insert({
      token_hash: tokenHash,
      label: input.label ?? null,
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to mint gateway token: ${error?.message ?? "unknown error"}`,
    );
  }

  return {
    token: plaintext,
    tokenId: data.id as string,
    expiresAt: data.expires_at as string,
  };
}

// Polls the gateways table to see if a token has been consumed — the
// onboarding UI uses this to detect when the remote gateway has
// bootstrapped and advance past the "waiting" spinner.
export async function checkTokenConsumed(tokenId: string): Promise<
  | { consumed: true; gatewayId: string }
  | { consumed: false; expired: boolean }
> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("gateway_registration_tokens")
    .select("consumed_at, consumed_by_gateway_id, expires_at")
    .eq("id", tokenId)
    .maybeSingle();

  if (!data) return { consumed: false, expired: true };
  if (data.consumed_at && data.consumed_by_gateway_id) {
    return { consumed: true, gatewayId: data.consumed_by_gateway_id as string };
  }
  const expired = new Date(data.expires_at as string).getTime() < Date.now();
  return { consumed: false, expired };
}
