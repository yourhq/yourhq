import { Suspense } from "react";
import { OnboardingWizard } from "@/components/onboarding/wizard/onboarding-wizard";
import { getOnboardingState } from "@/lib/projects";
import type { WizardStep } from "@/components/onboarding/wizard/use-wizard-state";

export const dynamic = "force-dynamic";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

async function getHostedWorkspaceId(): Promise<string | null> {
  if (!isHosted) return null;
  try {
    const { getWorkspaceSession } = await import("@/lib/projects/hosted-registry");
    const session = await getWorkspaceSession();
    return session?.workspaceId ?? null;
  } catch {
    return null;
  }
}

export default async function OnboardingPage() {
  const state = await getOnboardingState();
  const hostedWorkspaceId = await getHostedWorkspaceId();

  const initialStep =
    typeof state.data.hostedInitialStep === "string"
      ? (state.data.hostedInitialStep as WizardStep)
      : undefined;

  const initialData = {
    ...(state.data as Record<string, unknown>),
    ...(hostedWorkspaceId ? { hostedWorkspaceId } : {}),
  };

  return (
    <Suspense>
      <OnboardingWizard
        isHosted={isHosted}
        initialStep={initialStep}
        initialData={initialData}
      />
    </Suspense>
  );
}
