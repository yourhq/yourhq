import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/secrets/crypto";
import { PROVIDER_MANIFESTS } from "@/lib/sources/generated-manifests";

export const dynamic = "force-dynamic";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const manifest = PROVIDER_MANIFESTS[provider];

  if (!manifest?.auth.oauth) {
    return redirectWithError(req, provider, "OAuth not configured for this provider");
  }

  const oauth = manifest.auth.oauth;
  const clientId = process.env[oauth.env_client_id];
  const clientSecret = process.env[oauth.env_client_secret];
  if (!clientId || !clientSecret) {
    return redirectWithError(req, provider, `${manifest.name} OAuth not configured`);
  }

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return redirectWithError(req, provider, `Authorization failed: ${error}`);
  }

  if (!code || !state) {
    return redirectWithError(req, provider, "Missing code or state parameter");
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get(`${provider}_oauth_state`)?.value;
  cookieStore.delete(`${provider}_oauth_state`);

  if (!savedState || savedState !== state) {
    return redirectWithError(req, provider, "Invalid OAuth state — please try again");
  }

  const siteUrl = process.env.PUBLIC_SITE_URL || req.nextUrl.origin;
  const redirectUri = `${siteUrl}/api/sources/oauth/${provider}/callback`;

  const tokenHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  let tokenBody: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };

  if (oauth.auth_method === "basic") {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    tokenHeaders["Authorization"] = `Basic ${basicAuth}`;
  } else {
    tokenBody = { ...tokenBody, client_id: clientId, client_secret: clientSecret };
  }

  const tokenRes = await fetch(oauth.token_url, {
    method: "POST",
    headers: tokenHeaders,
    body: JSON.stringify(tokenBody),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error(`[${provider}-oauth] Token exchange failed:`, tokenRes.status, body);
    return redirectWithError(req, provider, "Failed to exchange authorization code");
  }

  const tokenData = (await tokenRes.json()) as Record<string, unknown>;
  const accessToken = tokenData[oauth.token_field] as string | undefined;

  if (!accessToken) {
    return redirectWithError(req, provider, "No access token in OAuth response");
  }

  const accountLabel =
    (getNestedValue(tokenData, oauth.response_mapping.account_label ?? "") as string) ??
    manifest.name;

  const meta: Record<string, unknown> = {};
  const credentials: Record<string, unknown> = { oauth: true };

  for (const [target, sourcePath] of Object.entries(oauth.response_mapping)) {
    if (target === "account_label") continue;
    const value = getNestedValue(tokenData, sourcePath);
    if (value === undefined) continue;

    if (target.startsWith("meta.")) {
      meta[target.slice(5)] = value;
    } else if (target.startsWith("credentials.")) {
      credentials[target.slice(12)] = value;
    }
  }

  const supabase = await createAdminClient();

  const { data: gateways } = await supabase
    .from("gateways")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  const gatewayId = gateways?.[0]?.id;

  const { data: connection, error: insertError } = await supabase
    .from("source_connections")
    .insert({
      provider,
      account_label: accountLabel,
      credentials,
      sync_interval_hours: 6,
      next_sync_at: new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
      meta,
    })
    .select("id")
    .single();

  if (insertError || !connection) {
    console.error(`[${provider}-oauth] Insert failed:`, insertError);
    return redirectWithError(req, provider, "Failed to save connection");
  }

  if (gatewayId) {
    try {
      const secretKey = `${provider.toUpperCase()}_SOURCE_${connection.id.slice(0, 8).toUpperCase()}`;
      const encrypted = await encryptSecret(accessToken);
      const { data: secret } = await supabase
        .from("secrets")
        .insert({
          gateway_id: gatewayId,
          key: secretKey,
          name: `${manifest.name} (${accountLabel})`,
          encrypted_value: encrypted,
          category: "integration",
          note: `Auto-created by ${manifest.name} OAuth. Used for source sync.`,
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
      console.error(`[${provider}-oauth] Failed to store encrypted secret, falling back to credentials:`, e);
      await supabase
        .from("source_connections")
        .update({ credentials: { ...credentials, api_key: accessToken } })
        .eq("id", connection.id);
    }
  } else {
    await supabase
      .from("source_connections")
      .update({ credentials: { ...credentials, api_key: accessToken } })
      .eq("id", connection.id);
  }

  return NextResponse.redirect(
    new URL(
      `/dashboard/settings/sources/${connection.id}?oauth=success`,
      siteUrl,
    ),
  );
}

function redirectWithError(req: NextRequest, provider: string, message: string) {
  const siteUrl = process.env.PUBLIC_SITE_URL || req.nextUrl.origin;
  const url = new URL("/dashboard/settings/sources", siteUrl);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
