import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBrowserScreenshot } from "@/lib/agent-repo/gateway-backend";
import { resolveAgentContext } from "@/lib/workspace/branch";

export async function GET(
  request: Request,
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
  const { gatewayId } = await resolveAgentContext(slug);
  const url = new URL(request.url);
  const quality = Number(url.searchParams.get("quality") || "50");
  const maxWidth = Number(url.searchParams.get("maxWidth") || "1280");

  try {
    const res = await getBrowserScreenshot(slug, { quality, maxWidth }, gatewayId);
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const status = (e as { status?: number }).status ?? 500;
    const message =
      e instanceof Error ? e.message : "Failed to capture screenshot";
    return NextResponse.json({ error: message }, { status });
  }
}
