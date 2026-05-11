import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { PROVIDER_MANIFESTS } from "@/lib/sources/generated-manifests";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const manifest = PROVIDER_MANIFESTS[provider];

  if (!manifest?.auth.oauth) {
    return NextResponse.json(
      { error: `OAuth not available for provider: ${provider}` },
      { status: 400 },
    );
  }

  const oauth = manifest.auth.oauth;
  const clientId = process.env[oauth.env_client_id];
  if (!clientId) {
    return NextResponse.json(
      { error: `${manifest.name} OAuth not configured` },
      { status: 500 },
    );
  }

  const siteUrl = process.env.PUBLIC_SITE_URL || req.nextUrl.origin;
  const redirectUri = `${siteUrl}/api/sources/oauth/${provider}/callback`;

  const state = randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set(`${provider}_oauth_state`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const searchParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    ...oauth.extra_params,
  });

  if (oauth.scopes.length > 0) {
    searchParams.set("scope", oauth.scopes.join(" "));
  }

  return NextResponse.redirect(
    `${oauth.authorize_url}?${searchParams.toString()}`,
  );
}
