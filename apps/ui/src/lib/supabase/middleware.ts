import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getActiveProject,
  getOnboardingState,
} from "@/lib/projects";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/projects/cookie";
import {
  getWorkspaceSession,
  getProvisionStatus,
} from "@/lib/projects/hosted-registry";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

const ONBOARDING_PATH = "/onboarding";
const LOGIN_PATH = "/login";
const AUTH_PATH = "/auth";
// Paths that work without a configured project.
const NO_PROJECT_OK_PATHS_OSS = [ONBOARDING_PATH, "/api/config"];
const NO_PROJECT_OK_PATHS_HOSTED = [
  LOGIN_PATH, AUTH_PATH, "/signup", "/provision", ONBOARDING_PATH, "/api/config",
];
// Paths that work without an authenticated user (but still need a project).
const NO_AUTH_OK_PATHS = [LOGIN_PATH, AUTH_PATH, ONBOARDING_PATH];

function matches(path: string, allowed: string[]): boolean {
  return allowed.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const activeIdHint =
    request.cookies.get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
  const project = await getActiveProject(activeIdHint).catch(() => null);

  if (!project) {
    const noProjectPaths = isHosted
      ? NO_PROJECT_OK_PATHS_HOSTED
      : NO_PROJECT_OK_PATHS_OSS;

    if (matches(request.nextUrl.pathname, noProjectPaths)) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = isHosted ? AUTH_PATH : ONBOARDING_PATH;
    return NextResponse.redirect(url);
  }

  if (!isHosted && activeIdHint && activeIdHint !== project.id) {
    supabaseResponse.cookies.set(ACTIVE_PROJECT_COOKIE, project.id, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isOnboarding = matches(request.nextUrl.pathname, [ONBOARDING_PATH]);
  const isLogin = matches(request.nextUrl.pathname, NO_AUTH_OK_PATHS);

  if (!user && isApi) {
    return new NextResponse(
      JSON.stringify({ error: "unauthenticated" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!user && !isDashboard && !isOnboarding && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = isHosted ? AUTH_PATH : LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  if (user && (request.nextUrl.pathname.startsWith(LOGIN_PATH) || (isHosted && request.nextUrl.pathname === AUTH_PATH))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (isHosted && user && isDashboard && !matches(request.nextUrl.pathname, ["/dashboard/account"])) {
    const ws = await getWorkspaceSession().catch(() => null);
    if (ws) {
      const status = await getProvisionStatus(ws.workspaceId).catch(() => null);
      if (status?.subscription_status === "suspended") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard/account";
        return NextResponse.redirect(url);
      }
    }
  }

  if (!isHosted) {
    if (user && request.nextUrl.pathname.startsWith(ONBOARDING_PATH)) {
      const onboarding = await getOnboardingState().catch(() => null);
      if (onboarding?.complete) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    }

    if (user && request.nextUrl.pathname.startsWith("/dashboard")) {
      const onboarding = await getOnboardingState().catch(() => null);
      if (onboarding && !onboarding.complete) {
        const url = request.nextUrl.clone();
        url.pathname = ONBOARDING_PATH;
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
