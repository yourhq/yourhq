import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EMBEDDER_URL = process.env.EMBEDDER_URL || "http://embedder:18801";

export async function POST(req: NextRequest) {
  try {
    const { input } = (await req.json()) as { input?: string };
    if (!input?.trim()) {
      return NextResponse.json({ error: "input_required" }, { status: 400 });
    }

    const res = await fetch(`${EMBEDDER_URL}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { error: "embedder_error", detail: body },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return NextResponse.json({ error: "embedder_timeout" }, { status: 504 });
    }
    return NextResponse.json(
      { error: "embedder_unavailable" },
      { status: 502 },
    );
  }
}
