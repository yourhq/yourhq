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

// Fetches a single gateway by id. Used by the detail page server component;
// the realtime subscription on the client takes over after that.
export async function getGatewayAction(
  id: string,
): Promise<GatewayActionResult<Gateway>> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("gateways")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Gateway not found." };
  return { ok: true, data: data as Gateway };
}

// Resolves a gateway's reachable noVNC URL. Used by Open Desktop on
// the agent page (we have agent.gateway_id but not the gateway's
// reachable_urls without a fetch).
//
// Returns the override base URL if the user set one, else
// meta.reachable_urls.novnc, else null.
export async function getGatewayDesktopUrlAction(
  gatewayId: string,
): Promise<GatewayActionResult<{ novncUrl: string | null; gatewayLabel: string }>> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("gateways")
    .select("label, meta")
    .eq("id", gatewayId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Gateway not found." };

  const meta = (data.meta ?? {}) as {
    reachable_urls?: { novnc?: string };
    reachable_urls_override?: { base: string };
    networking_mode?: string;
    vnc_password?: string;
  };

  let novncUrl: string | null = meta.reachable_urls?.novnc ?? null;
  const overrideBase = meta.reachable_urls_override?.base?.trim();

  if (overrideBase && novncUrl) {
    try {
      const u = new URL(novncUrl);
      const o = new URL(overrideBase);
      u.protocol = o.protocol;
      u.hostname = o.hostname;
      if (o.port) u.port = o.port;
      novncUrl = u.toString();
    } catch {
      // Override didn't parse; fall through to the auto URL.
    }
  }

  // Co-located gateways (local networking mode, no override): route
  // through the /desktop/ rewrite proxy instead of hitting port 6901
  // directly — that port is no longer exposed to the host.
  if (
    novncUrl &&
    !overrideBase &&
    (meta.networking_mode ?? "local") === "local"
  ) {
    const pw = meta.vnc_password ? `&password=${encodeURIComponent(meta.vnc_password)}` : "";
    novncUrl = `/desktop/vnc.html?autoconnect=1&resize=remote&path=desktop/websockify${pw}`;
  } else if (novncUrl && meta.vnc_password) {
    const sep = novncUrl.includes("?") ? "&" : "?";
    novncUrl = `${novncUrl}${sep}password=${encodeURIComponent(meta.vnc_password)}`;
  }

  return {
    ok: true,
    data: { novncUrl, gatewayLabel: data.label as string },
  };
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
// to "ready" the moment the remote install-gateway.sh has run +
// consume_gateway_token() has succeeded.
export async function pollGatewayTokenAction(
  tokenId: string,
): Promise<
  GatewayActionResult<
    | { status: "pending" }
    | { status: "expired" }
    | { status: "ready"; gatewayId: string }
  >
> {
  const r = await checkTokenConsumed(tokenId);
  if (r.consumed) {
    return { ok: true, data: { status: "ready", gatewayId: r.gatewayId } };
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

// Renames a gateway. The slug stays put — that's how the runner finds
// itself in `lease_command(p_gateway_slug)`. Editing slug would require
// reconfiguring the gateway's env, which we don't want to encourage.
export async function updateGatewayLabelAction(
  gatewayId: string,
  label: string,
): Promise<GatewayActionResult> {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Label is required." };
  if (trimmed.length > 80) return { ok: false, error: "Label is too long." };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("gateways")
    .update({ label: trimmed })
    .eq("id", gatewayId);

  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard/settings/gateways");
  revalidatePath(`/dashboard/settings/gateways/${gatewayId}`);
  return { ok: true };
}

// Override the reachable_urls.base the gateway wrote at boot. Useful when
// the auto-detected value (HOST_REACHABLE_URL) is wrong or when the user
// fronted the gateway behind a custom reverse proxy. Pass null to clear.
//
// We store the override in meta.reachable_urls_override so the gateway's
// next boot doesn't clobber it — readers should prefer override over
// the auto-written reachable_urls.
export async function updateReachableUrlOverrideAction(
  gatewayId: string,
  baseUrl: string | null,
): Promise<GatewayActionResult> {
  const supabase = await createAdminClient();
  const { data: gw, error: getErr } = await supabase
    .from("gateways")
    .select("meta")
    .eq("id", gatewayId)
    .single();
  if (getErr || !gw) {
    return { ok: false, error: getErr?.message ?? "Gateway not found." };
  }

  const trimmed = baseUrl?.trim() || null;
  if (trimmed) {
    try {
      // Validate it parses + has a protocol. We don't enforce http/https
      // (some users tunnel via custom schemes) but parse failure means
      // we'd render a broken link.
      new URL(trimmed);
    } catch {
      return { ok: false, error: "Not a valid URL." };
    }
  }

  const meta = (gw.meta ?? {}) as Record<string, unknown>;
  const nextMeta = { ...meta };
  if (trimmed) {
    nextMeta.reachable_urls_override = { base: trimmed };
  } else {
    delete nextMeta.reachable_urls_override;
  }

  const { error } = await supabase
    .from("gateways")
    .update({ meta: nextMeta })
    .eq("id", gatewayId);

  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath(`/dashboard/settings/gateways/${gatewayId}`);
  return { ok: true };
}

export async function toggleGatewayPauseAction(
  gatewayId: string,
  currentStatus: string,
): Promise<GatewayActionResult<{ newStatus: string }>> {
  const supabase = await createAdminClient();
  const newStatus = currentStatus === "paused" ? "ready" : "paused";
  const { error } = await supabase
    .from("gateways")
    .update({ status: newStatus })
    .eq("id", gatewayId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/settings/gateways");
  revalidatePath(`/dashboard/settings/gateways/${gatewayId}`);
  return { ok: true, data: { newStatus } };
}
