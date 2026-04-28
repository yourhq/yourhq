"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { mintGatewayToken, checkTokenConsumed } from "@/lib/gateways/mint-token";
import { buildGatewayOneLiner } from "@/lib/gateways/one-liner";
import { getActiveProjectWithSecrets } from "@/lib/projects/registry";
import type { Gateway } from "@/lib/gateways/types";

export interface GatewayMintInput {
  label?: string;
  tailscaleAuthKey?: string;
}

export interface MintedGatewayBootstrap {
  token: string;
  tokenId: string;
  expiresAt: string;
  oneLiner: string;
  label: string;
}

export interface GatewayActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

// Lists every gateway in the active project. Server-side rendering of the
// Settings → Gateways page calls this once on load; the realtime
// subscription on the client keeps it fresh after that.
export async function listGatewaysAction(): Promise<
  GatewayActionResult<Gateway[]>
> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("gateways")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, data: (data ?? []) as Gateway[] };
}

// Mints a single-use registration token + builds the one-liner the user
// runs on the target host. The token is shown plaintext in the dialog
// once and is never stored — only its sha256 hash sits in the DB.
export async function mintGatewayTokenForSettings(
  input: GatewayMintInput,
): Promise<GatewayActionResult<MintedGatewayBootstrap>> {
  const project = await getActiveProjectWithSecrets();
  if (!project) {
    return { ok: false, error: "No project configured." };
  }

  const label = (input.label ?? "Gateway").trim() || "Gateway";
  const minted = await mintGatewayToken({ label });

  const oneLiner = buildGatewayOneLiner({
    token: minted.token,
    label,
    project,
    tailscaleAuthKey: input.tailscaleAuthKey,
  });

  return {
    ok: true,
    data: {
      token: minted.token,
      tokenId: minted.tokenId,
      expiresAt: minted.expiresAt,
      oneLiner,
      label,
    },
  };
}

// Polled by the AddGatewayDialog while it shows the one-liner — flips
// to "online" the moment the remote install-gateway.sh has run +
// consume_gateway_token() has succeeded.
export async function pollGatewayTokenAction(
  tokenId: string,
): Promise<
  GatewayActionResult<
    | { status: "pending" }
    | { status: "expired" }
    | { status: "online"; gatewayId: string }
  >
> {
  const r = await checkTokenConsumed(tokenId);
  if (r.consumed) {
    return { ok: true, data: { status: "online", gatewayId: r.gatewayId } };
  }
  if (r.expired) {
    return { ok: true, data: { status: "expired" } };
  }
  return { ok: true, data: { status: "pending" } };
}

// Removes a gateway row. Used from the gateway detail page when the user
// has decommissioned the host. We don't touch the agents that targeted
// this gateway — the FK is non-null, so it errors out cleanly if there
// are still agents bound, prompting the user to deal with them first.
export async function removeGatewayAction(
  gatewayId: string,
): Promise<GatewayActionResult> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("gateways")
    .delete()
    .eq("id", gatewayId);

  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard/settings/gateways");
  return { ok: true };
}
