import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface ValidateRequest {
  provider: string;
  credentials: Record<string, unknown>;
}

interface ValidateResponse {
  valid: boolean;
  error?: string;
  account_name?: string;
}

async function validateNotion(
  credentials: Record<string, unknown>,
): Promise<ValidateResponse> {
  const apiKey = credentials.api_key as string;
  if (!apiKey) return { valid: false, error: "No API key provided" };

  try {
    const res = await fetch("https://api.notion.com/v1/users/me", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        valid: false,
        error: body.message || `Notion returned ${res.status}`,
      };
    }

    const data = await res.json();
    const botName = data.bot?.owner?.workspace?.name ?? data.name ?? "Notion";
    return { valid: true, account_name: botName };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

async function validateGoogleDrive(
  credentials: Record<string, unknown>,
): Promise<ValidateResponse> {
  const serviceAccount = credentials.service_account as Record<string, string> | undefined;
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    return { valid: false, error: "Invalid service account key" };
  }

  // TODO Phase 6: implement JWT-based auth and test Drive API call
  return { valid: false, error: "Google Drive not yet supported" };
}

export async function POST(req: NextRequest) {
  try {
    const { provider, credentials } = (await req.json()) as ValidateRequest;

    if (!provider || !credentials) {
      return NextResponse.json(
        { valid: false, error: "provider and credentials are required" },
        { status: 400 },
      );
    }

    let result: ValidateResponse;

    switch (provider) {
      case "notion":
        result = await validateNotion(credentials);
        break;
      case "google_drive":
        result = await validateGoogleDrive(credentials);
        break;
      default:
        result = { valid: false, error: `Unknown provider: ${provider}` };
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { valid: false, error: "Validation failed" },
      { status: 500 },
    );
  }
}
