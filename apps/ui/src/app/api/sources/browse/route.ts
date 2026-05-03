import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface BrowseRequest {
  connection_id: string;
  parent_id?: string | null;
  search?: string | null;
}

interface BrowseItem {
  external_id: string;
  title: string;
  source_url: string;
  item_type: string;
  has_children: boolean;
  parent_path?: string;
}

// ── Notion ────────────────────────────────────────────────────────

function notionHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

function notionPageUrl(id: string) {
  return `https://notion.so/${id.replace(/-/g, "")}`;
}

function extractNotionTitle(page: Record<string, unknown>): string {
  const props = page.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return "Untitled";
  for (const prop of Object.values(props)) {
    if (prop.type === "title") {
      const titles = prop.title as Array<{ plain_text: string }>;
      return titles?.map((t) => t.plain_text).join("") || "Untitled";
    }
  }
  return "Untitled";
}

async function browseNotion(
  apiKey: string,
  parentId?: string | null,
  search?: string | null,
): Promise<BrowseItem[]> {
  if (search) {
    return browseNotionSearch(apiKey, search);
  }
  if (parentId) {
    return browseNotionChildren(apiKey, parentId);
  }
  return browseNotionTopLevel(apiKey);
}

async function browseNotionSearch(
  apiKey: string,
  query: string,
): Promise<BrowseItem[]> {
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: notionHeaders(apiKey),
    body: JSON.stringify({ query, page_size: 30 }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Notion search failed: ${res.status}`);
  const data = await res.json();

  return (data.results ?? [])
    .filter((r: Record<string, unknown>) => r.object === "page" || r.object === "database")
    .map((r: Record<string, unknown>) => ({
      external_id: r.id as string,
      title:
        r.object === "page"
          ? extractNotionTitle(r)
          : ((r.title as Array<{ plain_text: string }>) ?? [])
              .map((t) => t.plain_text)
              .join("") || "Untitled database",
      source_url: notionPageUrl(r.id as string),
      item_type: r.object === "database" ? "database" : "page",
      has_children: true,
    }));
}

async function browseNotionTopLevel(apiKey: string): Promise<BrowseItem[]> {
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: notionHeaders(apiKey),
    body: JSON.stringify({
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 100,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Notion search failed: ${res.status}`);
  const data = await res.json();

  return (data.results ?? [])
    .filter((r: Record<string, unknown>) => {
      const parent = r.parent as Record<string, unknown> | undefined;
      return !parent?.page_id;
    })
    .map((r: Record<string, unknown>) => ({
      external_id: r.id as string,
      title: extractNotionTitle(r),
      source_url: notionPageUrl(r.id as string),
      item_type: "page" as const,
      has_children: true,
    }));
}

async function browseNotionChildren(
  apiKey: string,
  parentId: string,
): Promise<BrowseItem[]> {
  const res = await fetch(
    `https://api.notion.com/v1/blocks/${parentId}/children?page_size=100`,
    {
      headers: notionHeaders(apiKey),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`Notion blocks fetch failed: ${res.status}`);
  const data = await res.json();

  const items: BrowseItem[] = [];
  for (const block of data.results ?? []) {
    const btype = block.type as string;
    if (btype === "child_page") {
      items.push({
        external_id: block.id,
        title: block.child_page?.title ?? "Untitled",
        source_url: notionPageUrl(block.id),
        item_type: "page",
        has_children: block.has_children ?? false,
      });
    } else if (btype === "child_database") {
      items.push({
        external_id: block.id,
        title: block.child_database?.title ?? "Untitled database",
        source_url: notionPageUrl(block.id),
        item_type: "database",
        has_children: true,
      });
    }
  }
  return items;
}

// ── Route handler ─────────────────────────────────────────────────

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

    const supabase = await createAdminClient();
    const { data: connection, error: fetchError } = await supabase
      .from("source_connections")
      .select("provider, credentials")
      .eq("id", connection_id)
      .single();

    if (fetchError || !connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    const { provider, credentials } = connection;
    let items: BrowseItem[];

    switch (provider) {
      case "notion": {
        const apiKey = (credentials as Record<string, string>).api_key;
        if (!apiKey) {
          return NextResponse.json(
            { error: "No API key configured" },
            { status: 400 },
          );
        }
        items = await browseNotion(apiKey, parent_id, search);
        break;
      }
      case "google_drive":
        // TODO Phase 6
        items = [];
        break;
      default:
        return NextResponse.json(
          { error: `Unknown provider: ${provider}` },
          { status: 400 },
        );
    }

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Browse failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
