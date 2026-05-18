import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getFileContent,
  saveFile,
  createFile,
  deleteFile,
} from "@/lib/agent-repo/gateway-backend";
import { logAudit } from "@/lib/audit/log";
import { resolveAgentContext } from "@/lib/workspace/branch";

type RouteParams = { params: Promise<{ slug: string; path: string[] }> };

async function authorize() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return supabase;
}

export async function GET(_request: Request, { params }: RouteParams) {
  if (!(await authorize())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, path } = await params;
  const { branch, gatewayId } = await resolveAgentContext(slug);
  const filePath = path.join("/");

  try {
    const file = await getFileContent(branch, filePath, gatewayId);
    return NextResponse.json(file);
  } catch (e: unknown) {
    console.error("[api/agents/files] Error reading file:", e);
    const message = e instanceof Error ? e.message : "Failed to read file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const supabase = await authorize();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, path } = await params;
  const { branch, gatewayId } = await resolveAgentContext(slug);
  const filePath = path.join("/");
  const body = (await request.json()) as { content: string; sha: string };

  try {
    const newSha = await saveFile(branch, filePath, body.content, body.sha, gatewayId);

    logAudit(supabase, {
      module: "agents",
      entity_type: "agent_file",
      entity_id: `${slug}/${filePath}`,
      action: "updated",
      summary: `Updated file ${filePath} on branch ${branch}`,
    });

    return NextResponse.json({ sha: newSha, path: filePath });
  } catch (e: unknown) {
    console.error("[api/agents/files] Error saving file:", e);
    const message = e instanceof Error ? e.message : "Failed to save file";
    const status =
      (e as { status?: number }).status === 409 ||
      message.includes("changed on disk") ||
      message.includes("does not match")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const supabase = await authorize();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, path } = await params;
  const { branch, gatewayId } = await resolveAgentContext(slug);
  const filePath = path.join("/");
  const body = (await request.json()) as { content?: string };

  try {
    const sha = await createFile(branch, filePath, body.content ?? "", gatewayId);

    logAudit(supabase, {
      module: "agents",
      entity_type: "agent_file",
      entity_id: `${slug}/${filePath}`,
      action: "created",
      summary: `Created file ${filePath} on branch ${branch}`,
    });

    return NextResponse.json({ sha, path: filePath }, { status: 201 });
  } catch (e: unknown) {
    console.error("[api/agents/files] Error creating file:", e);
    const message = e instanceof Error ? e.message : "Failed to create file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const supabase = await authorize();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, path } = await params;
  const { branch, gatewayId } = await resolveAgentContext(slug);
  const filePath = path.join("/");
  const body = (await request.json()) as { sha: string };

  try {
    await deleteFile(branch, filePath, body.sha, gatewayId);

    logAudit(supabase, {
      module: "agents",
      entity_type: "agent_file",
      entity_id: `${slug}/${filePath}`,
      action: "deleted",
      summary: `Deleted file ${filePath} from branch ${branch}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[api/agents/files] Error deleting file:", e);
    const message = e instanceof Error ? e.message : "Failed to delete file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
