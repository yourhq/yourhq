import "server-only";

import type {
  PublicWorkspace,
  WorkspaceSecrets,
  WorkspaceWithSecrets,
  OnboardingState,
} from "./schema";

import * as file from "./registry";
import * as hosted from "./hosted-registry";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export async function getActiveWorkspace(
  activeIdHint?: string | null,
): Promise<PublicWorkspace | null> {
  if (isHosted) return hosted.getActiveWorkspace(activeIdHint);
  return file.getActiveWorkspace(activeIdHint);
}

export async function getActiveWorkspaceWithSecrets(
  activeIdHint?: string | null,
): Promise<WorkspaceWithSecrets | null> {
  if (isHosted) return hosted.getActiveWorkspaceWithSecrets(activeIdHint);
  return file.getActiveWorkspaceWithSecrets(activeIdHint);
}

export async function getWorkspaceSecrets(
  id: string,
): Promise<WorkspaceSecrets | null> {
  if (isHosted) return hosted.getWorkspaceSecrets(id);
  return file.getWorkspaceSecrets(id);
}

export async function getOnboardingState(): Promise<OnboardingState> {
  if (isHosted) return hosted.getOnboardingState();
  return file.getOnboardingState();
}

export async function patchOnboardingState(
  patch: Partial<Pick<OnboardingState, "step" | "complete">> & {
    data?: Record<string, unknown>;
  },
): Promise<OnboardingState> {
  if (isHosted) return hosted.patchOnboardingState(patch);
  return file.patchOnboardingState(patch);
}

export async function addWorkspace(input: Parameters<typeof file.addWorkspace>[0]) {
  if (isHosted) {
    throw new Error("Hosted workspaces are provisioned automatically.");
  }
  return file.addWorkspace(input);
}

export interface SwitcherWorkspace {
  id: string;
  label: string;
  emoji: string;
}

export async function listSwitcherWorkspaces(): Promise<{
  activeWorkspaceId: string | null;
  workspaces: SwitcherWorkspace[];
}> {
  if (isHosted) {
    const workspace = await hosted.getActiveWorkspace();
    if (!workspace) return { activeWorkspaceId: null, workspaces: [] };
    const siblings = await hosted.listSiblingWorkspaces();
    return {
      activeWorkspaceId: workspace.id,
      workspaces: (siblings.length > 0 ? siblings : [workspace]).map((w) => ({
        id: w.id,
        label: w.label,
        emoji: w.emoji,
      })),
    };
  }
  const registry = await file.getRegistry();
  return {
    activeWorkspaceId: registry.activeWorkspaceId,
    workspaces: registry.workspaces.map((w) => ({
      id: w.id,
      label: w.label,
      emoji: w.emoji,
    })),
  };
}
