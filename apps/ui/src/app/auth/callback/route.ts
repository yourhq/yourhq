import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getActiveProject } from "@/lib/projects";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "magiclink" | "email" | null;
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (!tokenHash || !type) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "missing_token");
    return NextResponse.redirect(url);
  }

  const project = await getActiveProject().catch(() => null);
  if (!project) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "no_workspace");
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(new URL(next, origin));

  const cookiePrefix = `hq-${project.id.slice(0, 8)}`;
  const supabase = createServerClient(project.url, project.anonKey, {
    cookieOptions: { name: cookiePrefix },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type === "magiclink" ? "magiclink" : "email",
  });

  if (error) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "verification_failed");
    return NextResponse.redirect(url);
  }

  return response;
}
