import { OnboardingForm } from "@/components/projects/onboarding-form";

export default function OnboardingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="text-4xl mb-3">🏠</div>
          <h1 className="text-2xl font-semibold mb-2">Welcome to HQ</h1>
          <p className="text-sm text-muted-foreground">
            Connect your Supabase project to get started. HQ stores nothing on our servers — your data lives in a project you own.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}
