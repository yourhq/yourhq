"use server";

import { getProvisionStatus } from "@/lib/projects/hosted-registry";

export async function pollProvisionAction(workspaceId: string) {
  return getProvisionStatus(workspaceId);
}
