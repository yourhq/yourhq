"use client";

import { useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { CONTEXT_PRESETS } from "@/lib/setup/templates";
import { cn } from "@/lib/utils";
import { StepWelcome } from "@/components/onboarding/wizard/step-welcome";
import { StepIntent } from "@/components/onboarding/wizard/step-intent";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCheckoutAction } from "./actions";

interface SignupData {
  email: string;
  ownerName: string;
  preferredName: string;
  workspaceLabel: string;
  workspaceSlug: string;
  contextPreset: string;
}

export function SignupForm() {
  const [step, setStep] = useState<"welcome" | "intent" | "checkout">("welcome");
  const [data, setData] = useState<SignupData>({
    email: "",
    ownerName: "",
    preferredName: "",
    workspaceLabel: "",
    workspaceSlug: "",
    contextPreset: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function patch(fields: Partial<SignupData>) {
    setData((prev) => ({ ...prev, ...fields }));
  }

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("email", data.email);
      fd.set("ownerName", data.ownerName);
      fd.set("label", data.workspaceLabel || "My Workspace");
      fd.set("emoji", "🏠");
      fd.set("contextPreset", data.contextPreset);
      await createCheckoutAction(fd);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  const steps = ["welcome", "intent", "checkout"];
  const currentIndex = steps.indexOf(step);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-background/95">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-5 lg:px-8">
        <div>
          {step !== "welcome" && (
            <button
              type="button"
              onClick={() => setStep(step === "checkout" ? "intent" : "welcome")}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
          )}
        </div>
        <div className="text-[11px] font-semibold tracking-tight text-foreground">
          HQ
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center overflow-y-auto px-5 pb-24 lg:px-8">
        <div className="w-full max-w-xl pt-8">
          {step === "welcome" && (
            <StepWelcome
              initialName={data.ownerName}
              pending={false}
              onSubmit={(values) => {
                patch({
                  ownerName: values.ownerName,
                  preferredName: values.preferredName,
                  workspaceLabel: values.workspaceName,
                  workspaceSlug: values.workspaceSlug,
                });
                setStep("intent");
              }}
            />
          )}

          {step === "intent" && (
            <StepIntent
              ownerName={data.ownerName}
              initialKey={data.contextPreset}
              pending={false}
              onSubmit={(intentKey) => {
                patch({ contextPreset: intentKey });
                setStep("checkout");
              }}
            />
          )}

          {step === "checkout" && (
            <CheckoutStep
              data={data}
              email={data.email}
              error={error}
              loading={loading}
              onEmailChange={(email) => patch({ email })}
              onCheckout={handleCheckout}
            />
          )}
        </div>
      </main>

      <footer className="flex h-10 items-center justify-center gap-1.5 border-t border-border/20">
        {steps.map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-all",
              s === step
                ? "w-4 bg-foreground"
                : i < currentIndex
                  ? "bg-foreground/40"
                  : "bg-muted-foreground/20",
            )}
          />
        ))}
      </footer>
    </div>
  );
}

function CheckoutStep({
  data,
  email,
  error,
  loading,
  onEmailChange,
  onCheckout,
}: {
  data: SignupData;
  email: string;
  error: string | null;
  loading: boolean;
  onEmailChange: (email: string) => void;
  onCheckout: () => void;
}) {
  const preset = CONTEXT_PRESETS.find((p) => p.key === data.contextPreset);
  const emailValid = email.includes("@");

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Hosted workspace
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Continue to payment
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          We&apos;ll provision your database and E2B gateway after checkout,
          then bring you back to finish provider, agent, and first-task setup.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-[13px] font-medium text-foreground">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          autoComplete="email"
          className="h-10"
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Workspace</span>
          <span className="font-medium">{data.workspaceLabel || "My Workspace"}</span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Intent</span>
          <span className="font-medium">
            {preset?.emoji} {preset?.label ?? "Custom"}
          </span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium">Pro - $30/mo</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onCheckout}
        disabled={!emailValid || loading}
        className={cn(
          "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
          !emailValid || loading
            ? "cursor-not-allowed bg-muted text-muted-foreground/50"
            : "bg-foreground text-background hover:bg-foreground/90",
        )}
      >
        {loading ? "Redirecting..." : "Continue to Stripe"}
        {!loading && (
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        )}
      </button>
    </div>
  );
}
