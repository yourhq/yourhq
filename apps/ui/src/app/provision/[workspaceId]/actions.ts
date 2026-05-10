"use server";

import { getProvisionStatus } from "@/lib/workspaces/hosted-registry";

export async function pollProvisionAction(workspaceId: string) {
  return getProvisionStatus(workspaceId);
}
