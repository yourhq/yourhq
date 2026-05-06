// Set the active project. Called by the project switcher.
// Writes both the cookie AND the registry's activeProjectId so server
// components, middleware, and file-based code all agree on which
// project is active.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProject, setActiveProject } from "@/lib/projects/registry";
import {
  ACTIVE_PROJECT_COOKIE,
  ACTIVE_PROJECT_COOKIE_OPTIONS,
} from "@/lib/projects/cookie";
import {
  canAccessWorkspace,
  createWorkspaceSessionValue,
  HOSTED_SESSION_COOKIE,
} from "@/lib/projects/hosted-registry";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

const schema = z.object({
  projectId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (isHosted) {
    const allowed = await canAccessWorkspace(parsed.data.projectId);
    if (!allowed) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const jar = await cookies();
    jar.set(HOSTED_SESSION_COOKIE, createWorkspaceSessionValue(parsed.data.projectId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return NextResponse.json({ ok: true, projectId: parsed.data.projectId });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const project = await getProject(parsed.data.projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  await setActiveProject(parsed.data.projectId);
  const jar = await cookies();
  jar.set(
    ACTIVE_PROJECT_COOKIE,
    parsed.data.projectId,
    ACTIVE_PROJECT_COOKIE_OPTIONS,
  );
  return NextResponse.json({ ok: true, projectId: parsed.data.projectId });
}
