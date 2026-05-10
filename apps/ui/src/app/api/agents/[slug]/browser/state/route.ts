import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBrowserState } from "@/lib/agent-repo/gateway-backend";

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

  try {
    const state = await getBrowserState(slug);
    return NextResponse.json(state);
  } catch (e: unknown) {
    const status = (e as { status?: number }).status ?? 500;
    const message =
      e instanceof Error ? e.message : "Failed to fetch browser state";
    return NextResponse.json({ error: message }, { status });
  }
}
