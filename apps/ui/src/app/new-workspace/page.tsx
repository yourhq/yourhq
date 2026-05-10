import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NewWorkspaceWizard } from "@/components/workspaces/new-workspace-wizard";

export const dynamic = "force-dynamic";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

async function getHostedEmail(): Promise<string | null> {
  if (!isHosted) return null;
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return jar.get("hq_hosted_email")?.value ?? null;
  } catch {
    return null;
  }
}

export default async function NewWorkspacePage() {
  const hostedEmail = await getHostedEmail();

  return (
    <Suspense>
      <NewWorkspaceWizard
        isHosted={isHosted}
        email={hostedEmail ?? undefined}
      />
    </Suspense>
  );
}
