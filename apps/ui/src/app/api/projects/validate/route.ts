// POST /api/projects/validate — checks a proposed set of Supabase creds
// before saving. Same logic as the onboarding flow; lives here so the
// client-side Add Project dialog can call it from the browser.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validateSupabaseCreds } from "@/lib/projects/validate";

const schema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(20),
  serviceRoleKey: z.string().min(20),
});

export async function POST(req: NextRequest) {
  // Require a session — validating a URL + keys can be abused to probe
  // arbitrary hosts, so limit to authed users.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await validateSupabaseCreds(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, hint: result.hint },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
