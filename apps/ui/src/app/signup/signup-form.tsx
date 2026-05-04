"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Check,
} from "lucide-react";
import { CONTEXT_PRESETS } from "@/lib/setup/templates";
import { IntentCards } from "@/components/onboarding/wizard/intent-cards";
import { cn } from "@/lib/utils";
import { createCheckoutAction } from "./actions";

interface SignupData {
  email: string;
  ownerName: string;
  workspaceLabel: string;
  workspaceEmoji: string;
  contextPreset: string;
}

const EMOJI_OPTIONS = [
  "🏠",
  "🚀",
  "💼",
  "🧪",
  "🎯",
  "⚡",
  "🌊",
  "🔥",
  "🏗️",
  "🧠",
];

export function SignupForm() {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [data, setData] = useState<SignupData>({
    email: "",
    ownerName: "",
    workspaceLabel: "",
    workspaceEmoji: "🚀",
    contextPreset: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function patch(fields: Partial<SignupData>) {
    setData((prev) => ({ ...prev, ...fields }));
  }

  function goTo(s: number) {
    setDir(s > step ? 1 : -1);
    setStep(s);
  }

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("email", data.email);
      fd.set("ownerName", data.ownerName);
      fd.set("label", data.workspaceLabel || "My Workspace");
      fd.set("emoji", data.workspaceEmoji);
      fd.set("contextPreset", data.contextPreset);
      await createCheckoutAction(fd);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  const step0Valid = data.email.includes("@") && data.ownerName.trim().length > 0;
  const step1Valid = data.contextPreset.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-[460px]">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
            <Sparkles className="h-[18px] w-[18px]" />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
              {step === 0
                ? "Create your workspace"
                : step === 1
                  ? `What will you use HQ for${data.ownerName ? `, ${data.ownerName.split(" ")[0]}` : ""}?`
                  : "Ready to go"}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {step === 0
                ? "Set up your account in under a minute."
                : step === 1
                  ? "We'll pre-configure your pipeline and fields."
                  : "Review your workspace and continue to payment."}
            </p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="mb-6 flex items-center justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "h-[3px] rounded-full transition-all duration-300",
                i === step
                  ? "w-8 bg-foreground"
                  : i < step
                    ? "w-2 bg-foreground/30"
                    : "w-2 bg-border",
              )}
            />
          ))}
        </div>

        {/* Card */}
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
          <div
            className={cn(
              "transition-all duration-200 ease-out",
              dir === 1
                ? "animate-in slide-in-from-right-2 fade-in"
                : "animate-in slide-in-from-left-2 fade-in",
            )}
            key={step}
          >
            {step === 0 && <StepAccount data={data} patch={patch} onNext={() => goTo(1)} valid={step0Valid} />}
            {step === 1 && <StepContext data={data} patch={patch} onBack={() => goTo(0)} onNext={() => goTo(2)} valid={step1Valid} />}
            {step === 2 && <StepConfirm data={data} error={error} loading={loading} onBack={() => goTo(1)} onCheckout={handleCheckout} />}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-5 text-center text-[12px] text-muted-foreground">
          Already have an account?{" "}
          <a
            href="/login"
            className="text-foreground underline underline-offset-4 hover:no-underline"
          >
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

/* ── Step 0: Account ───────────────────────────────────────── */

function StepAccount({
  data,
  patch,
  onNext,
  valid,
}: {
  data: SignupData;
  patch: (f: Partial<SignupData>) => void;
  onNext: () => void;
  valid: boolean;
}) {
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && valid) {
      e.preventDefault();
      onNext();
    }
  }

  return (
    <div className="p-6 space-y-5" onKeyDown={handleKeyDown}>
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-[12px] font-medium text-muted-foreground">
          Email
        </Label>
        <Input
          ref={emailRef}
          id="email"
          type="email"
          placeholder="you@company.com"
          value={data.email}
          onChange={(e) => patch({ email: e.target.value })}
          autoComplete="email"
          className="h-10"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ownerName" className="text-[12px] font-medium text-muted-foreground">
          Your name
        </Label>
        <Input
          id="ownerName"
          type="text"
          placeholder="Jane Smith"
          value={data.ownerName}
          onChange={(e) => patch({ ownerName: e.target.value })}
          autoComplete="name"
          className="h-10"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="label" className="text-[12px] font-medium text-muted-foreground">
          Workspace name
        </Label>
        <div className="flex gap-2">
          <div className="relative shrink-0">
            <select
              value={data.workspaceEmoji}
              onChange={(e) => patch({ workspaceEmoji: e.target.value })}
              className="flex h-10 w-12 cursor-pointer appearance-none items-center justify-center rounded-md border border-input bg-background text-center text-base ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent/50"
            >
              {EMOJI_OPTIONS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <Input
            id="label"
            type="text"
            placeholder="Acme Inc"
            value={data.workspaceLabel}
            onChange={(e) => patch({ workspaceLabel: e.target.value })}
            autoComplete="off"
            className="h-10 flex-1"
          />
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!valid}
        className={cn(
          "flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-all",
          valid
            ? "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98]"
            : "bg-muted text-muted-foreground cursor-not-allowed",
        )}
      >
        Continue
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ── Step 1: Context preset ────────────────────────────────── */

function StepContext({
  data,
  patch,
  onBack,
  onNext,
  valid,
}: {
  data: SignupData;
  patch: (f: Partial<SignupData>) => void;
  onBack: () => void;
  onNext: () => void;
  valid: boolean;
}) {
  return (
    <div className="p-6 space-y-5">
      <IntentCards
        selected={data.contextPreset || null}
        onSelect={(key) => patch({ contextPreset: key })}
      />

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex h-10 items-center gap-1.5 rounded-lg px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!valid}
          className={cn(
            "flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-all",
            valid
              ? "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98]"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          Continue
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ── Step 2: Confirm + Checkout ────────────────────────────── */

function StepConfirm({
  data,
  error,
  loading,
  onBack,
  onCheckout,
}: {
  data: SignupData;
  error: string | null;
  loading: boolean;
  onBack: () => void;
  onCheckout: () => void;
}) {
  const preset = CONTEXT_PRESETS.find((p) => p.key === data.contextPreset);

  return (
    <div className="p-6 space-y-5">
      {/* Summary */}
      <div className="rounded-lg border border-border/40 bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-background border border-border/60 text-lg">
            {data.workspaceEmoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium truncate">
              {data.workspaceLabel || "My Workspace"}
            </p>
            <p className="text-[12px] text-muted-foreground truncate">
              {data.email}
            </p>
          </div>
        </div>

        <div className="h-px bg-border/40" />

        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">Template</span>
          <span className="font-medium">
            {preset?.emoji} {preset?.label ?? "Custom"}
          </span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium">Pro — $30/mo</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex h-10 items-center gap-1.5 rounded-lg px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <button
          onClick={onCheckout}
          disabled={loading}
          className={cn(
            "flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-all",
            "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98]",
            loading && "opacity-70 cursor-wait",
          )}
        >
          {loading ? "Redirecting…" : "Continue to payment"}
          {!loading && <ArrowRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      <p className="text-center text-[11px] text-muted-foreground/70">
        You&apos;ll be redirected to Stripe for secure payment.
      </p>
    </div>
  );
}
