import { listGatewayBackupsAction } from "./actions";
import { BackupsSettings } from "@/components/backups/backups-settings";

export const dynamic = "force-dynamic";

export default async function BackupsSettingsPage() {
  const r = await listGatewayBackupsAction();
  return <BackupsSettings initialBackups={r.ok ? (r.data ?? []) : []} />;
}
