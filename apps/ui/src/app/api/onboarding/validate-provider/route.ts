import { NextRequest, NextResponse } from "next/server";

interface ValidateProviderRequest {
  provider: "openai" | "anthropic" | "ollama";
  apiKey?: string;
}

interface ValidateProviderResponse {
  valid: boolean;
  error?: string;
  models?: string[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ValidateProviderRequest;
  const { provider, apiKey } = body;

  if (!provider) {
    return NextResponse.json(
      { valid: false, error: "Provider is required" },
      { status: 400 },
    );
  }

  try {
    if (provider === "openai") {
      if (!apiKey) {
        return NextResponse.json({ valid: false, error: "API key is required" });
      }
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        return NextResponse.json({ valid: false, error: "Invalid API key" });
      }
      const data = await res.json();
      const models = (data.data as { id: string }[])
        .map((m) => m.id)
        .filter((id) => id.includes("gpt") || id.includes("o3") || id.includes("o4"))
        .slice(0, 10);
      return NextResponse.json({ valid: true, models });
    }

    if (provider === "anthropic") {
      if (!apiKey) {
        return NextResponse.json({ valid: false, error: "API key is required" });
      }
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json({ valid: false, error: "Invalid API key" });
      }
      return NextResponse.json({
        valid: true,
        models: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
      });
    }

    if (provider === "ollama") {
      const res = await fetch("http://localhost:11434/api/tags", {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return NextResponse.json({
          valid: false,
          error: "Could not reach Ollama at localhost:11434",
        });
      }
      const data = await res.json();
      const models = (data.models as { name: string }[])?.map((m) => m.name) ?? [];
      return NextResponse.json({ valid: true, models });
    }

    return NextResponse.json(
      { valid: false, error: `Unknown provider: ${provider}` },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json({
      valid: false,
      error: err instanceof Error ? err.message : "Validation failed",
    });
  }
}
