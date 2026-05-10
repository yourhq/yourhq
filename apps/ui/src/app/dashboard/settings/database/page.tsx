import { getRegistry } from "@/lib/workspaces/registry";
import { DatabaseSettings } from "@/components/workspaces/database-settings";

export const dynamic = "force-dynamic";

export default async function DatabaseSettingsPage() {
  const registry = await getRegistry();
  return (
    <DatabaseSettings
      activeWorkspaceId={registry.activeWorkspaceId}
      workspaces={registry.workspaces.map((w) => ({
        id: w.id,
        label: w.label,
        emoji: w.emoji,
        url: w.url,
        isDefault: w.isDefault,
        createdAt: w.createdAt,
      }))}
    />
  );
}
