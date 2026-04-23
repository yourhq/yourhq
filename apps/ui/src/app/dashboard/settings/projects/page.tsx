import { getRegistry } from "@/lib/projects/registry";
import { ProjectsSettings } from "@/components/projects/projects-settings";

export const dynamic = "force-dynamic";

export default async function ProjectsSettingsPage() {
  const registry = await getRegistry();
  return (
    <ProjectsSettings
      activeProjectId={registry.activeProjectId}
      projects={registry.projects.map((p) => ({
        id: p.id,
        label: p.label,
        emoji: p.emoji,
        url: p.url,
        isDefault: p.isDefault,
        createdAt: p.createdAt,
      }))}
    />
  );
}
