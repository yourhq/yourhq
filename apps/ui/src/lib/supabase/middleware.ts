import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getActiveProject } from "@/lib/projects/registry";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/projects/cookie";

const ONBOARDING_PATH = "/onboarding";
const LOGIN_PATH = "/login";
// Paths the middleware lets through regardless of auth / onboarding state.
const PUBLIC_PATHS = [ONBOARDING_PATH, LOGIN_PATH, "/auth", "/api/config"];

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Resolve the active project from the registry + cookie. If no project
  // is configured yet, redirect to /onboarding (unless we're already there).
  const activeIdHint =
    request.cookies.get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
  const project = await getActiveProject(activeIdHint).catch(() => null);

  if (!project) {
    if (isPublic(request.nextUrl.pathname)) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = ONBOARDING_PATH;
    return NextResponse.redirect(url);
  }

  // With a project resolved, set up the cookie-aware Supabase client and
  // run the usual auth gating.
  const supabase = createServerClient(project.url, project.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh the auth token and read the current user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login, except on public paths.
  if (!user && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from login/onboarding.
  if (
    user &&
    (request.nextUrl.pathname.startsWith(LOGIN_PATH) ||
      request.nextUrl.pathname.startsWith(ONBOARDING_PATH))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
