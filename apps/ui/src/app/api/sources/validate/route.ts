import { NextRequest, NextResponse } from "next/server";
import { requireAuth, UnauthenticatedError } from "@/lib/supabase/require-auth";
import { resolveGatewayFilesApi } from "@/lib/sources/gateway";

export const dynamic = "force-dynamic";

interface ValidateRequest {
  provider: string;
  credentials: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof UnauthenticatedError)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    throw e;
  }
  try {
    const { provider, credentials } = (await req.json()) as ValidateRequest;

    if (!provider || !credentials) {
      return NextResponse.json(
        { valid: false, error: "provider and credentials are required" },
        { status: 400 },
      );
    }

    const { url: filesApiUrl, token, error } = await resolveGatewayFilesApi();
    if (error || !filesApiUrl) {
      return NextResponse.json(
        { valid: false, error: error ?? "No gateway available to validate credentials" },
      );
    }

    const res = await fetch(`${filesApiUrl}/sources/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ provider, credentials }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { valid: false, error: "Validation failed" },
      { status: 500 },
    );
  }
}
