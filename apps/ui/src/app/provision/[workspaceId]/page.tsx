import { redirect } from "next/navigation";
import { ProvisionStatus } from "./provision-status";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default async function ProvisionPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  if (!isHosted) redirect("/");
  const { workspaceId } = await params;
  return <ProvisionStatus workspaceId={workspaceId} />;
}
