import { listGatewaysAction } from "./actions";
import { GatewaysSettings } from "@/components/gateways/gateways-settings";

export const dynamic = "force-dynamic";

export default async function GatewaysSettingsPage() {
  const r = await listGatewaysAction();
  // If listing fails (e.g. registry empty during a brief race), render
  // with no gateways and let the client surface refetch errors.
  return <GatewaysSettings initialGateways={r.ok ? (r.data ?? []) : []} />;
}
