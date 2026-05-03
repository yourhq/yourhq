import "server-only";

import type {
  PublicProject,
  ProjectSecrets,
  ProjectWithSecrets,
  OnboardingState,
} from "./schema";

import * as file from "./registry";
import * as hosted from "./hosted-registry";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export async function getActiveProject(
  activeIdHint?: string | null,
): Promise<PublicProject | null> {
  if (isHosted) return hosted.getActiveProject(activeIdHint);
  return file.getActiveProject(activeIdHint);
}

export async function getActiveProjectWithSecrets(
  activeIdHint?: string | null,
): Promise<ProjectWithSecrets | null> {
  if (isHosted) return hosted.getActiveProjectWithSecrets(activeIdHint);
  return file.getActiveProjectWithSecrets(activeIdHint);
}

export async function getProjectSecrets(
  id: string,
): Promise<ProjectSecrets | null> {
  if (isHosted) return hosted.getProjectSecrets(id);
  return file.getProjectSecrets(id);
}

export async function getOnboardingState(): Promise<OnboardingState> {
  if (isHosted) return hosted.getOnboardingState();
  return file.getOnboardingState();
}

export interface SwitcherProject {
  id: string;
  label: string;
  emoji: string;
}

export async function listSwitcherProjects(): Promise<{
  activeProjectId: string | null;
  projects: SwitcherProject[];
}> {
  if (isHosted) {
    const project = await hosted.getActiveProject();
    if (!project) return { activeProjectId: null, projects: [] };
    return {
      activeProjectId: project.id,
      projects: [{ id: project.id, label: project.label, emoji: project.emoji }],
    };
  }
  const registry = await file.getRegistry();
  return {
    activeProjectId: registry.activeProjectId,
    projects: registry.projects.map((p) => ({
      id: p.id,
      label: p.label,
      emoji: p.emoji,
    })),
  };
}
