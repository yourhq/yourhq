// Authenticated CRUD for the workspace registry.
//
// All routes require an authenticated Supabase session. The active
// workspace (used for auth) comes from the hq_active_workspace cookie —
// so users who switched workspaces are authorized against whichever
// workspace they're currently on.
//
// Returns PublicWorkspace shape only (no service role keys) to the
// browser. Service role keys are set via POST/PATCH request bodies
// and live in secrets.json on disk.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { addWorkspace, getRegistry } from "@/lib/workspaces/registry";

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

// ── GET /api/workspaces ──────────────────────────────────────────────────
// Returns the full public registry. Used by the settings page + switcher.
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const registry = await getRegistry();
  return NextResponse.json(registry);
}

// ── POST /api/workspaces ─────────────────────────────────────────────────
// Add a workspace. Body: { label, emoji, url, anonKey, serviceRoleKey,
// makeDefault? }. Doesn't validate Supabase reachability here — the UI's
// Add Workspace dialog should call /api/workspaces/validate first.
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
  const workspace = await addWorkspace(parsed.data);
  return NextResponse.json(workspace, { status: 201 });
}
