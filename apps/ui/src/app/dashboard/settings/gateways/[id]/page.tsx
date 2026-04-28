import { notFound } from "next/navigation";
import { getGatewayAction } from "../actions";
import { GatewayDetail } from "@/components/gateways/gateway-detail";

export const dynamic = "force-dynamic";

export default async function GatewayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = await getGatewayAction(id);
  if (!r.ok || !r.data) notFound();
  return <GatewayDetail initialGateway={r.data} />;
}
