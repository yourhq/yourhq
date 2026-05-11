import { NextRequest, NextResponse } from "next/server";
import { resolveGatewayFilesApi } from "@/lib/sources/gateway";

export const dynamic = "force-dynamic";

interface BrowseRequest {
  connection_id: string;
  parent_id?: string | null;
  search?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const { connection_id, parent_id, search } =
      (await req.json()) as BrowseRequest;

    if (!connection_id) {
      return NextResponse.json(
        { error: "connection_id is required" },
        { status: 400 },
      );
    }

    const { url: filesApiUrl, token, error } = await resolveGatewayFilesApi();
    if (error || !filesApiUrl) {
      return NextResponse.json(
        { error: error ?? "No gateway available" },
        { status: 503 },
      );
    }

    const res = await fetch(`${filesApiUrl}/sources/browse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ connection_id, parent_id, search }),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Browse failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
