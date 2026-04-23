import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getOnboardingState } from "@/lib/projects/registry";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const state = await getOnboardingState();
  return (
    <OnboardingWizard
      initial={{ step: state.step, data: state.data as Record<string, unknown> }}
    />
  );
}
