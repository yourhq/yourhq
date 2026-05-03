import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Notion OAuth not configured" },
      { status: 500 },
    );
  }

  const siteUrl =
    process.env.PUBLIC_SITE_URL || req.nextUrl.origin;
  const redirectUri = `${siteUrl}/api/sources/oauth/notion/callback`;

  const state = randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("notion_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    owner: "user",
  });

  return NextResponse.redirect(
    `https://api.notion.com/v1/oauth/authorize?${params.toString()}`,
  );
}
