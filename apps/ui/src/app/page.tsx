import { redirect } from "next/navigation";
import { getActiveWorkspace, getOnboardingState } from "@/lib/workspaces";

export default async function Home() {
  if (process.env.DEPLOYMENT_MODE === "hosted") {
    redirect("/login");
  }

  const workspace = await getActiveWorkspace().catch(() => null);

  if (!workspace) {
    redirect("/onboarding");
  }

  // Workspace row exists but onboarding may not be complete (e.g.
  // gateway not set up, provider not connected, agent not created).
  // Resume the wizard so the user can finish from any browser.
  const onboarding = await getOnboardingState().catch(() => null);
  if (onboarding && !onboarding.complete) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
