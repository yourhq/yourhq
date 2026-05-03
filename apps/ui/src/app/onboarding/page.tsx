import { OnboardingWizardV2 } from "@/components/onboarding/v2/onboarding-wizard-v2";
import { getOnboardingState } from "@/lib/projects/registry";

export const dynamic = "force-dynamic";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default async function OnboardingPage() {
  const state = await getOnboardingState();

  return (
    <OnboardingWizardV2
      isHosted={isHosted}
      initialData={state.data as Record<string, unknown>}
    />
  );
}
