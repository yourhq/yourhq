import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getActiveProject,
  getOnboardingState,
} from "@/lib/projects/registry";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/projects/cookie";

const ONBOARDING_PATH = "/onboarding";
const LOGIN_PATH = "/login";
// Paths that work without a configured project.
const NO_PROJECT_OK_PATHS = [ONBOARDING_PATH, "/api/config"];
// Paths that work without an authenticated user (but still need a project).
const NO_AUTH_OK_PATHS = [LOGIN_PATH, "/auth"];

function matches(path: string, allowed: string[]): boolean {
  return allowed.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Resolve the active project from the registry + cookie. If no project
  // is configured yet, redirect to /onboarding (unless we're already there).
  const activeIdHint =
    request.cookies.get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
  const project = await getActiveProject(activeIdHint).catch(() => null);

  if (!project) {
    // No project yet — redirect everything except onboarding + /api/config
    // to /onboarding. /login, /auth, dashboard, etc. all need a project.
    if (matches(request.nextUrl.pathname, NO_PROJECT_OK_PATHS)) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = ONBOARDING_PATH;
    return NextResponse.redirect(url);
  }

  // Clear a stale cookie: cookie pointed at a project id that no longer
  // exists, but getActiveProject fell through to another project. Without
  // this, the client's window.__HQ_CONFIG__ reflects one project while
  // the cookie still says another — next request flips back. Overwrite
  // the cookie with whatever we actually resolved to.
  if (activeIdHint && activeIdHint !== project.id) {
    supabaseResponse.cookies.set(ACTIVE_PROJECT_COOKIE, project.id, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
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

  // Redirect unauthenticated users to login, except on no-auth-ok paths.
  if (
    !user &&
    !matches(request.nextUrl.pathname, NO_AUTH_OK_PATHS) &&
    !matches(request.nextUrl.pathname, NO_PROJECT_OK_PATHS)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from /login once they're signed in.
  if (user && request.nextUrl.pathname.startsWith(LOGIN_PATH)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Onboarding is a multi-step wizard that spans pre-auth (placement,
  // Supabase creds, networking) and post-auth (workspace, pipeline, …)
  // steps. We don't kick users out of /onboarding just because they've
  // authenticated — but if onboarding is already complete, we do.
  if (user && request.nextUrl.pathname.startsWith(ONBOARDING_PATH)) {
    const onboarding = await getOnboardingState().catch(() => null);
    if (onboarding?.complete) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // If onboarding isn't complete and the user is trying to access the
  // dashboard, bounce them back to /onboarding to finish. This matters
  // for resumable onboarding — close the tab mid-flow and come back.
  if (
    user &&
    request.nextUrl.pathname.startsWith("/dashboard")
  ) {
    const onboarding = await getOnboardingState().catch(() => null);
    if (onboarding && !onboarding.complete) {
      const url = request.nextUrl.clone();
      url.pathname = ONBOARDING_PATH;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
