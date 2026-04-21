import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFileTree, branchExists } from "@/lib/agent-repo/gateway-backend";
import { resolveAgentBranch } from "@/lib/workspace/branch";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const branch = await resolveAgentBranch(slug);

  try {
    const exists = await branchExists(branch);
    if (!exists) {
      // The worktree doesn't exist yet (agent never provisioned). Return
      // empty tree rather than 404 so the file browser renders a blank
      // state instead of an error.
      return NextResponse.json([]);
    }
    const entries = await getFileTree(branch);
    return NextResponse.json(entries);
  } catch (e: unknown) {
    console.error("[api/agents/files] Error fetching tree:", e);
    const message =
      e instanceof Error ? e.message : "Failed to fetch file tree";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
