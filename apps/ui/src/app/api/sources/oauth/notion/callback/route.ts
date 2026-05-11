import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/secrets/crypto";

export const dynamic = "force-dynamic";

interface NotionOAuthTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_icon: string | null;
  owner: {
    type: string;
    user?: {
      id: string;
      name: string;
    };
  };
  duplicated_template_id: string | null;
  request_id: string;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithError(req, "Notion OAuth not configured");
  }

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return redirectWithError(req, `Notion authorization failed: ${error}`);
  }

  if (!code || !state) {
    return redirectWithError(req, "Missing code or state parameter");
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("notion_oauth_state")?.value;
  cookieStore.delete("notion_oauth_state");

  if (!savedState || savedState !== state) {
    return redirectWithError(req, "Invalid OAuth state — please try again");
  }

  const siteUrl = process.env.PUBLIC_SITE_URL || req.nextUrl.origin;
  const redirectUri = `${siteUrl}/api/sources/oauth/notion/callback`;

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("[notion-oauth] Token exchange failed:", tokenRes.status, body);
    return redirectWithError(req, "Failed to exchange authorization code");
  }

  const tokenData: NotionOAuthTokenResponse = await tokenRes.json();

  const label =
    tokenData.workspace_name ||
    tokenData.owner?.user?.name ||
    "Notion workspace";

  const supabase = await createAdminClient();

  // Resolve a gateway for storing the secret (use first available)
  const { data: gateways } = await supabase
    .from("gateways")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  const gatewayId = gateways?.[0]?.id;

  // Insert the source connection (credentials holds only non-secret metadata)
  const { data: connection, error: insertError } = await supabase
    .from("source_connections")
    .insert({
      provider: "notion",
      account_label: label,
      credentials: {
        oauth: true,
        bot_id: tokenData.bot_id,
        workspace_id: tokenData.workspace_id,
      },
      sync_interval_hours: 6,
      next_sync_at: new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
      meta: {
        workspace_icon: tokenData.workspace_icon,
        owner_type: tokenData.owner?.type,
        owner_name: tokenData.owner?.user?.name,
      },
    })
    .select("id")
    .single();

  if (insertError || !connection) {
    console.error("[notion-oauth] Insert failed:", insertError);
    return redirectWithError(req, "Failed to save connection");
  }

  // Store the access token as an encrypted secret
  if (gatewayId) {
    try {
      const secretKey = `NOTION_SOURCE_${connection.id.slice(0, 8).toUpperCase()}`;
      const encrypted = await encryptSecret(tokenData.access_token);
      const { data: secret } = await supabase
        .from("secrets")
        .insert({
          gateway_id: gatewayId,
          key: secretKey,
          name: `Notion (${label})`,
          encrypted_value: encrypted,
          category: "integration",
          note: "Auto-created by Notion OAuth. Used for source sync.",
        })
        .select("id")
        .single();

      if (secret) {
        await supabase
          .from("source_connections")
          .update({ secret_id: secret.id })
          .eq("id", connection.id);
      }
    } catch (e) {
      console.error("[notion-oauth] Failed to store encrypted secret, falling back to credentials:", e);
      await supabase
        .from("source_connections")
        .update({ credentials: { oauth: true, bot_id: tokenData.bot_id, workspace_id: tokenData.workspace_id, api_key: tokenData.access_token } })
        .eq("id", connection.id);
    }
  } else {
    // No gateway available — store token in credentials as fallback
    await supabase
      .from("source_connections")
      .update({ credentials: { oauth: true, bot_id: tokenData.bot_id, workspace_id: tokenData.workspace_id, api_key: tokenData.access_token } })
      .eq("id", connection.id);
  }

  return NextResponse.redirect(
    new URL(
      `/dashboard/settings/sources/${connection.id}?oauth=success`,
      siteUrl,
    ),
  );
}

function redirectWithError(req: NextRequest, message: string) {
  const siteUrl = process.env.PUBLIC_SITE_URL || req.nextUrl.origin;
  const url = new URL("/dashboard/settings/sources", siteUrl);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
