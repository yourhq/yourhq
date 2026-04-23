import { redirect } from "next/navigation";

// The old /setup wizard was merged into the unified onboarding flow.
// Any inbound links / bookmarks land on /onboarding, which resumes
// whatever step the registry has persisted.
export default function SetupPage() {
  redirect("/onboarding");
}
