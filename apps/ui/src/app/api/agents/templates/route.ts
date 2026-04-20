import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listBranches, getFileContent } from "@/lib/github/client";
import type { AgentManifest, AgentTemplate } from "@/lib/agents/types";

const TEMPLATE_PREFIX = "template/";
const CACHE_TTL_MS = 60_000;

let cache: { at: number; value: AgentTemplate[] } | null = null;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(cache.value);
  }

  try {
    const branches = await listBranches(TEMPLATE_PREFIX);

    const results = await Promise.all(
      branches.map(async (branch): Promise<AgentTemplate | null> => {
        try {
          const file = await getFileContent(branch, "agent.json");
          const manifest = JSON.parse(file.content) as AgentManifest;
          return {
            branch,
            name: manifest.name ?? branch.replace(TEMPLATE_PREFIX, ""),
            description: manifest.description ?? "",
            emoji: manifest.emoji,
            team: manifest.team,
            domains: manifest.domains,
            capabilities: manifest.capabilities,
          };
        } catch (e) {
          console.error(`[api/agents/templates] Skipping ${branch}:`, e);
          return null;
        }
      })
    );

    const templates = results.filter((t): t is AgentTemplate => t !== null);
    templates.sort((a, b) => a.name.localeCompare(b.name));

    cache = { at: Date.now(), value: templates };
    return NextResponse.json(templates);
  } catch (e: unknown) {
    console.error("[api/agents/templates] Error:", e);
    const message = e instanceof Error ? e.message : "Failed to list templates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
