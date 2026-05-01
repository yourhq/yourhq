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
  // this, the client's config reflects one project while the cookie still
  // says another — next request flips back. Overwrite the cookie with
  // whatever we actually resolved to.
  if (activeIdHint && activeIdHint !== project.id) {
    supabaseResponse.cookies.set(ACTIVE_PROJECT_COOKIE, project.id, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // With a project resolved, set up the cookie-aware Supabase client and
  // run the usual auth gating.
  //
  // `cookieOptions.name` must match the prefix the browser client uses
  // (see lib/supabase/client.ts#cookieNameFor). Each project gets its
  // own cookie prefix — `hq-<first-8-of-id>` — so two projects in the
  // same browser don't clobber each other's sessions.
  const cookiePrefix = `hq-${project.id.slice(0, 8)}`;
  const supabase = createServerClient(project.url, project.anonKey, {
    cookieOptions: { name: cookiePrefix },
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

  // Auth gating for unauthenticated users.
  //
  // Two flavors of unauthenticated:
  //   A) First visit, no project session exists yet → redirect to /login.
  //   B) Session expired / user switched to a project they haven't signed
  //      into in this browser → let the page render and have the client-
  //      side SignInModal (in DashboardShell via useAuthWatcher) handle
  //      auth inline instead of kicking the user away from their work.
  //
  // Middleware can't reliably distinguish (A) from (B) — they both look
  // like "no session cookie." So for dashboard paths we default to (B)
  // and let the modal take over. For onboarding we respect the wizard
  // state. Only API routes force a hard 401 so callers can react.
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isOnboarding = matches(request.nextUrl.pathname, [ONBOARDING_PATH]);
  const isLogin = matches(request.nextUrl.pathname, NO_AUTH_OK_PATHS);

  if (!user && isApi) {
    // API routes return a JSON 401 — caller's fetch layer decides whether
    // to pop the modal (via the auth watcher's requireSignIn()) or fail
    // silently. Doesn't clobber the current page.
    return new NextResponse(
      JSON.stringify({ error: "unauthenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!user && !isDashboard && !isOnboarding && !isLogin) {
    // Root / any other page with no session → /login is still the sane
    // default (first visit, bookmarked deep link, etc).
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
