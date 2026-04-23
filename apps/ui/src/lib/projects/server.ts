// Server-side helpers for reading the active project in Next.js App Router
// components, server actions, and API routes. Thin wrappers around the
// registry that combine it with the active-project cookie.
//
// Split into two entry points:
//   - readActiveProjectPublic():  returns PublicProject (no secrets).
//   - readActiveProjectWithSecrets():  returns ProjectWithSecrets — use
//     only when you truly need the service role key (rare).

import "server-only";

import { cookies } from "next/headers";
import { ACTIVE_PROJECT_COOKIE } from "./cookie";
import {
  getActiveProject,
  getActiveProjectWithSecrets,
} from "./registry";
import type { PublicProject, ProjectWithSecrets } from "./schema";

export async function readActiveProjectPublic(): Promise<PublicProject | null> {
  const jar = await cookies();
  const hint = jar.get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
  return getActiveProject(hint);
}

export async function readActiveProjectWithSecrets(): Promise<ProjectWithSecrets | null> {
  const jar = await cookies();
  const hint = jar.get(ACTIVE_PROJECT_COOKIE)?.value ?? null;
  return getActiveProjectWithSecrets(hint);
}
