// Public, unauthed read of the active workspace's browser-safe config.
//
// Returns the same fields the HqConfigProvider passes to client
// components. Service role keys live in /config/secrets.json and
// never appear here.
//
// The middleware allows `/api/config` to be reached without a
// configured workspace (it's in NO_WORKSPACE_OK_PATHS), so the browser
// can probe whether the server has a workspace yet.

import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspaces";

export async function GET() {
  const workspace = await getActiveWorkspace().catch(() => null);
  if (!workspace) {
    return NextResponse.json({ workspace: null }, { status: 200 });
  }
  return NextResponse.json({
    workspace: {
      workspaceId: workspace.id,
      label: workspace.label,
      emoji: workspace.emoji,
      url: workspace.url,
      anonKey: workspace.anonKey,
    },
  });
}
