import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFileTree, branchExists } from "@/lib/agent-repo/gateway-backend";
import { resolveAgentContext } from "@/lib/workspace/branch";

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
  const { branch, gatewayId } = await resolveAgentContext(slug);

  try {
    const exists = await branchExists(branch, gatewayId);
    if (!exists) {
      return NextResponse.json([]);
    }
    const entries = await getFileTree(branch, gatewayId);
    return NextResponse.json(entries);
  } catch (e: unknown) {
    console.error("[api/agents/files] Error fetching tree:", e);
    const message =
      e instanceof Error ? e.message : "Failed to fetch file tree";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
