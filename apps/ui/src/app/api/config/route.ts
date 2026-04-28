// Public, unauthed read of the active project's browser-safe config.
//
// Returns the same fields that the root layout already injects via
// `window.__HQ_CONFIG__` — so this endpoint never exposes anything the
// HTML response doesn't. Service role keys live in /config/secrets.json
// and never appear here.
//
// Why this exists: the middleware allows `/api/config` to be reached
// without a configured project (it's in NO_PROJECT_OK_PATHS), so the
// browser can probe whether the server has a project yet. Once we
// support project-switch-without-reload, the client can call this
// endpoint to refresh `window.__HQ_CONFIG__` instead of forcing a
// hard reload.

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
