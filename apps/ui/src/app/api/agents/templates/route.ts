import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUNDLED_TEMPLATES } from "@/generated/templates";

// Templates are platform content baked into the UI image at build time
// from the monorepo's templates/ directory. See:
//   apps/ui/scripts/build-templates-index.mjs → src/generated/templates.ts
//
// The gateway seeds the same directories into its local git repo, so
// `branch: "template/<slug>"` values here match what add-agent.sh can
// check out.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(BUNDLED_TEMPLATES);
}
