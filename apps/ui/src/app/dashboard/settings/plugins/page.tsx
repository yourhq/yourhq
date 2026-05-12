import { listPlugins } from "./actions";
import { PluginsSettings } from "@/components/plugins/plugins-settings";

export const dynamic = "force-dynamic";

export default async function PluginsSettingsPage() {
  const r = await listPlugins();
  const plugins = r.ok && r.data ? r.data.plugins : [];

  return <PluginsSettings initialPlugins={plugins} />;
}
