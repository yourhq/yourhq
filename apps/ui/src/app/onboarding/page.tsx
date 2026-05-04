import { OnboardingWizard } from "@/components/onboarding/wizard/onboarding-wizard";
import { getOnboardingState } from "@/lib/projects/registry";

export const dynamic = "force-dynamic";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default async function OnboardingPage() {
  const state = await getOnboardingState();

  return (
    <OnboardingWizard
      isHosted={isHosted}
      initialData={state.data as Record<string, unknown>}
    />
  );
}
