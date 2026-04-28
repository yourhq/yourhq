// Shared builder for the `curl | bash` install command we display in
// the UI when the user wants to add a remote gateway. Used by:
//   - Onboarding (first-time setup)
//   - Settings → Gateways → Add Gateway (Phase 3)
//
// The shape has to match the env vars install-gateway.sh requires.
// Anon key is necessary so the gateway can call consume_gateway_token()
// over PostgREST; service role key gives it ongoing access to REST +
// Realtime APIs after the token exchange. Both end up in the .env file
// on the target host — no creds are sent back to Supabase.

import "server-only";

export interface BuildOneLinerInput {
  token: string;
  label: string;
  project: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  tailscaleAuthKey?: string;
}

export function buildGatewayOneLiner(input: BuildOneLinerInput): string {
  // shell-quote anything user-influenced so embedded special characters
  // don't break the line. Tokens / keys are restricted-charset so they
  // don't strictly need quoting, but it's free safety.
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

  const lines = [
    "curl -fsSL https://raw.githubusercontent.com/yourhq/yourhq/main/installer/install-gateway.sh",
    `  | GATEWAY_TOKEN=${q(input.token)}`,
    `    SUPABASE_URL=${q(input.project.url)}`,
    `    SUPABASE_ANON_KEY=${q(input.project.anonKey)}`,
    `    SUPABASE_SERVICE_ROLE_KEY=${q(input.project.serviceRoleKey)}`,
    `    GATEWAY_LABEL=${q(input.label)}`,
  ];
  if (input.tailscaleAuthKey?.trim()) {
    lines.push(`    TAILSCALE_AUTH_KEY=${q(input.tailscaleAuthKey.trim())}`);
  }
  lines.push("    bash");

  return lines.join(" \\\n    ");
}
