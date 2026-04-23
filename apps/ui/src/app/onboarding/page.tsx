import { Sparkles } from "lucide-react";
import { OnboardingForm } from "@/components/projects/onboarding-form";

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-foreground/95 to-foreground/80 text-background shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="text-center">
            <h1 className="text-title">Connect Supabase</h1>
            <p className="text-caption text-muted-foreground">
              HQ lives on your Supabase. Nothing leaves your machine.
            </p>
          </div>
        </div>

        <OnboardingForm />

        <p className="text-center text-[11px] text-muted-foreground/70">
          New to Supabase? Create a project at{" "}
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noreferrer"
            className="text-foreground hover:underline"
          >
            supabase.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
