import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface UpsertPlaybookBody {
  title: string;
  content: string;
  action: "create" | "update";
  knowledge_item_id?: string;
  reason: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authHeader = req.headers.get("authorization");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!authHeader || !serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const body = (await req.json()) as UpsertPlaybookBody;

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!body.content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (!["create", "update"].includes(body.action)) {
    return NextResponse.json({ error: "action must be 'create' or 'update'" }, { status: 400 });
  }
  if (body.action === "update" && !body.knowledge_item_id) {
    return NextResponse.json({ error: "knowledge_item_id is required for updates" }, { status: 400 });
  }

  const supabase = await createAdminClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  try {
    if (body.action === "create") {
      const { data: item, error } = await supabase
        .from("knowledge_items")
        .insert({
          kind: "playbook",
          title: body.title.trim(),
          content: null,
          plain_text: body.content.trim(),
          scope: "agent",
        })
        .select("id")
        .single();

      if (error || !item) {
        return NextResponse.json(
          { error: error?.message ?? "Failed to create playbook" },
          { status: 500 }
        );
      }

      await supabase.from("knowledge_item_agents").insert({
        knowledge_item_id: item.id,
        agent_id: agent.id,
      });

      await supabase.from("audit_log").insert({
        actor_type: "agent",
        actor_agent_id: agent.id,
        module: "knowledge",
        entity_type: "knowledge_item",
        entity_id: item.id,
        action: "created",
        summary: body.reason?.trim() || `Created playbook '${body.title.trim()}'`,
      });

      return NextResponse.json({ id: item.id, action: "created" }, { status: 201 });
    }

    // Update
    const { error } = await supabase
      .from("knowledge_items")
      .update({
        title: body.title.trim(),
        plain_text: body.content.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.knowledge_item_id!)
      .eq("scope", "agent");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from("audit_log").insert({
      actor_type: "agent",
      actor_agent_id: agent.id,
      module: "knowledge",
      entity_type: "knowledge_item",
      entity_id: body.knowledge_item_id!,
      action: "updated",
      summary: body.reason?.trim() || `Updated playbook '${body.title.trim()}'`,
    });

    return NextResponse.json({ id: body.knowledge_item_id, action: "updated" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authHeader = req.headers.get("authorization");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!authHeader || !serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const supabase = await createAdminClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("slug", slug)
    .single();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const { data: junctions } = await supabase
    .from("knowledge_item_agents")
    .select("knowledge_item_id")
    .eq("agent_id", agent.id);

  if (!junctions?.length) {
    return NextResponse.json([]);
  }

  const itemIds = junctions.map((j: { knowledge_item_id: string }) => j.knowledge_item_id);
  const { data: items } = await supabase
    .from("knowledge_items")
    .select("id, title, kind, scope, plain_text, updated_at, created_at")
    .in("id", itemIds)
    .eq("kind", "playbook")
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  return NextResponse.json(items ?? []);
}
