import { OnboardingWizard } from "@/components/onboarding/wizard/onboarding-wizard";
import { getOnboardingState } from "@/lib/projects";
import type { WizardStep } from "@/components/onboarding/wizard/use-wizard-state";

export const dynamic = "force-dynamic";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default async function OnboardingPage() {
  const state = await getOnboardingState();
  const initialStep =
    typeof state.data.hostedInitialStep === "string"
      ? (state.data.hostedInitialStep as WizardStep)
      : undefined;

  return (
    <OnboardingWizard
      isHosted={isHosted}
      initialStep={initialStep}
      initialData={state.data as Record<string, unknown>}
    />
  );
}
