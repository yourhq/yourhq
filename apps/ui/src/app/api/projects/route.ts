// Authenticated CRUD for the project registry.
//
// All routes require an authenticated Supabase session. The active
// project (used for auth) comes from the hq_active_project cookie —
// so users who switched projects are authorized against whichever
// project they're currently on.
//
// Returns PublicProject shape only (no service role keys) to the
// browser. Service role keys are set via POST/PATCH request bodies
// and live in secrets.json on disk.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { addProject, getRegistry } from "@/lib/projects/registry";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  return user;
}

// ── GET /api/projects ────────────────────────────────────────────────────
// Returns the full public registry. Used by the settings page + switcher.
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const registry = await getRegistry();
  return NextResponse.json(registry);
}

// ── POST /api/projects ───────────────────────────────────────────────────
// Add a project. Body: { label, emoji, url, anonKey, serviceRoleKey,
// makeDefault? }. Doesn't validate Supabase reachability here — the UI's
// Add Project dialog should call /api/projects/validate first.
const postSchema = z.object({
  label: z.string().min(1).max(80),
  emoji: z.string().min(1).max(8),
  url: z.string().url(),
  anonKey: z.string().min(20),
  serviceRoleKey: z.string().min(20),
  makeDefault: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const project = await addProject(parsed.data);
  return NextResponse.json(project, { status: 201 });
}
