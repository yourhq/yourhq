import "server-only";

import { cookies } from "next/headers";
import { ACTIVE_WORKSPACE_COOKIE } from "./cookie";
import {
  getActiveWorkspace,
  getActiveWorkspaceWithSecrets,
} from "./index";
import type { PublicWorkspace, WorkspaceWithSecrets } from "./schema";

export async function readActiveWorkspacePublic(): Promise<PublicWorkspace | null> {
  const jar = await cookies();
  const hint = jar.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  return getActiveWorkspace(hint);
}

export async function readActiveWorkspaceWithSecrets(): Promise<WorkspaceWithSecrets | null> {
  const jar = await cookies();
  const hint = jar.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  return getActiveWorkspaceWithSecrets(hint);
}
