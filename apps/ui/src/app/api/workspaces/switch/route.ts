// Set the active workspace. Called by the workspace switcher.
// Writes both the cookie AND the registry's activeWorkspaceId so server
// components, middleware, and file-based code all agree on which
// workspace is active.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { getWorkspace, setActiveWorkspace } from "@/lib/workspaces/registry";
import {
  ACTIVE_WORKSPACE_COOKIE,
  ACTIVE_WORKSPACE_COOKIE_OPTIONS,
} from "@/lib/workspaces/cookie";
import {
  canAccessWorkspace,
  createWorkspaceSessionValue,
  HOSTED_SESSION_COOKIE,
} from "@/lib/workspaces/hosted-registry";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

const schema = z.object({
  workspaceId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (isHosted) {
    const allowed = await canAccessWorkspace(parsed.data.workspaceId);
    if (!allowed) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const jar = await cookies();
    jar.set(HOSTED_SESSION_COOKIE, createWorkspaceSessionValue(parsed.data.workspaceId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return NextResponse.json({ ok: true, workspaceId: parsed.data.workspaceId });
  }

  const workspace = await getWorkspace(parsed.data.workspaceId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const jar = await cookies();
  const cookiePrefix = `hq-${workspace.id.slice(0, 8)}`;

  const targetSupabase = createServerClient(workspace.url, workspace.anonKey, {
    cookieOptions: { name: cookiePrefix },
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          );
        } catch {
          // Called from a context where cookies can't be set — safe to ignore.
        }
      },
    },
  });

  const {
    data: { user },
  } = await targetSupabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setActiveWorkspace(parsed.data.workspaceId);
  jar.set(
    ACTIVE_WORKSPACE_COOKIE,
    parsed.data.workspaceId,
    ACTIVE_WORKSPACE_COOKIE_OPTIONS,
  );
  return NextResponse.json({ ok: true, workspaceId: parsed.data.workspaceId });
}
