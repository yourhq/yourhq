import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getActiveWorkspace } from "@/lib/workspaces";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";
const authPath = isHosted ? "/auth" : "/login";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "magiclink" | "email" | null;
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (!tokenHash || !type) {
    const url = new URL(authPath, origin);
    url.searchParams.set("error", "missing_token");
    return NextResponse.redirect(url);
  }

  const workspace = await getActiveWorkspace().catch(() => null);
  if (!workspace) {
    const url = new URL(authPath, origin);
    url.searchParams.set("error", "no_workspace");
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(new URL(next, origin));

  const cookiePrefix = `hq-${workspace.id.slice(0, 8)}`;
  const supabase = createServerClient(workspace.url, workspace.anonKey, {
    cookieOptions: { name: cookiePrefix },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        if (headers) {
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        }
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type === "magiclink" ? "magiclink" : "email",
  });

  if (error) {
    const url = new URL(authPath, origin);
    url.searchParams.set("error", "verification_failed");
    return NextResponse.redirect(url);
  }

  return response;
}
