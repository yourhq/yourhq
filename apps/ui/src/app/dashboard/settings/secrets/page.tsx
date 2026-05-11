import { listGatewaysAction } from "@/app/dashboard/settings/gateways/actions";
import { listSecretsForGateway } from "./actions";
import { SecretsSettings } from "@/components/secrets/secrets-settings";

export const dynamic = "force-dynamic";

export default async function SecretsSettingsPage() {
  const r = await listGatewaysAction();
  const gateways = r.ok && r.data ? r.data : [];

  const initialGateway =
    gateways.find((g) => g.status === "ready") ?? gateways[0] ?? null;

  const initialSecrets = initialGateway
    ? (await listSecretsForGateway(initialGateway.id)).data?.secrets ?? []
    : [];

  return (
    <SecretsSettings
      initialGateways={gateways}
      initialGatewayId={initialGateway?.id ?? null}
      initialSecrets={initialSecrets}
    />
  );
}
