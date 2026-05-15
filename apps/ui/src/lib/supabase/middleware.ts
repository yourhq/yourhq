import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getActiveWorkspace,
  getOnboardingState,
} from "@/lib/workspaces";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspaces/cookie";
import {
  getWorkspaceSession,
  getProvisionStatus,
} from "@/lib/workspaces/hosted-registry";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

const ONBOARDING_PATH = "/onboarding";
const LOGIN_PATH = "/login";
const AUTH_PATH = "/auth";
const NO_WORKSPACE_OK_PATHS_OSS = [ONBOARDING_PATH, "/api/config"];
const NO_WORKSPACE_OK_PATHS_HOSTED = [
  LOGIN_PATH, AUTH_PATH, "/signup", "/provision", ONBOARDING_PATH, "/api/config",
];
const NO_AUTH_OK_PATHS = [LOGIN_PATH, AUTH_PATH, ONBOARDING_PATH];

function matches(path: string, allowed: string[]): boolean {
  return allowed.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const activeIdHint =
    request.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const workspace = await getActiveWorkspace(activeIdHint).catch(() => null);

  if (!workspace) {
    const noWorkspacePaths = isHosted
      ? NO_WORKSPACE_OK_PATHS_HOSTED
      : NO_WORKSPACE_OK_PATHS_OSS;

    if (matches(request.nextUrl.pathname, noWorkspacePaths)) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = isHosted ? AUTH_PATH : ONBOARDING_PATH;
    return NextResponse.redirect(url);
  }

  if (!isHosted && activeIdHint && activeIdHint !== workspace.id) {
    supabaseResponse.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const cookiePrefix = `hq-${workspace.id.slice(0, 8)}`;
  const supabase = createServerClient(workspace.url, workspace.anonKey, {
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

  if (!user && isHosted && isOnboarding) {
    const hasHostedEmail = request.cookies.has("hq_hosted_email");
    const hasWorkspaceSession = request.cookies.has("hq_workspace_session");
    if (!hasHostedEmail && !hasWorkspaceSession) {
      const url = request.nextUrl.clone();
      url.pathname = AUTH_PATH;
      return NextResponse.redirect(url);
    }
  }

  if (!user && !isDashboard && !isOnboarding && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = isHosted ? AUTH_PATH : LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  if (user && (request.nextUrl.pathname.startsWith(LOGIN_PATH) || (isHosted && request.nextUrl.pathname === AUTH_PATH))) {
    const onboarding = await getOnboardingState().catch(() => null);
    const url = request.nextUrl.clone();
    url.pathname = onboarding && !onboarding.complete ? ONBOARDING_PATH : "/dashboard";
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

  return supabaseResponse;
}
