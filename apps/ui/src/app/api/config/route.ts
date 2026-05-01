// Public, unauthed read of the active project's browser-safe config.
//
// Returns the same fields the HqConfigProvider passes to client
// components. Service role keys live in /config/secrets.json and
// never appear here.
//
// The middleware allows `/api/config` to be reached without a
// configured project (it's in NO_PROJECT_OK_PATHS), so the browser
// can probe whether the server has a project yet.

import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/projects/registry";

export async function GET() {
  const project = await getActiveProject().catch(() => null);
  if (!project) {
    return NextResponse.json({ project: null }, { status: 200 });
  }
  return NextResponse.json({
    project: {
      projectId: project.id,
      label: project.label,
      emoji: project.emoji,
      url: project.url,
      anonKey: project.anonKey,
    },
  });
}
