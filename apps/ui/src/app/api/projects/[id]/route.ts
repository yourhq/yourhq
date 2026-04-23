import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  updateProject,
  deleteProject,
  rotateServiceRoleKey,
  getProject,
} from "@/lib/projects/registry";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// ── PATCH /api/projects/:id ──────────────────────────────────────────────
// Edit a project's label/emoji/default flag, or rotate its service role key.
const patchSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  emoji: z.string().min(1).max(8).optional(),
  makeDefault: z.boolean().optional(),
  serviceRoleKey: z.string().min(20).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await getProject(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { serviceRoleKey, ...publicUpdates } = parsed.data;

  if (Object.keys(publicUpdates).length > 0) {
    await updateProject(id, publicUpdates);
  }
  if (serviceRoleKey) {
    await rotateServiceRoleKey(id, serviceRoleKey);
  }

  const next = await getProject(id);
  return NextResponse.json(next);
}

// ── DELETE /api/projects/:id ─────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await deleteProject(id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
