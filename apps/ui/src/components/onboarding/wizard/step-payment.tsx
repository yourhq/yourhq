"use client";

import { useState } from "react";
import { ArrowRight, AlertCircle, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTEXT_PRESETS } from "@/lib/setup/templates";

interface StepPaymentProps {
  ownerName: string;
  workspaceLabel: string;
  intentKey: string;
  email: string;
  onCheckout: (email: string) => Promise<void>;
  pending: boolean;
}

export function StepPayment({
  ownerName: _ownerName,
  workspaceLabel,
  intentKey,
  email: initialEmail,
  onCheckout,
  pending,
}: StepPaymentProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const preset = CONTEXT_PRESETS.find((p) => p.key === intentKey);

  async function handleCheckout() {
    setError(null);
    setLoading(true);
    try {
      await onCheckout(initialEmail);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  const isLoading = loading || pending;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Almost there
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Activate your workspace
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          You&apos;ll be redirected to Stripe to complete payment, then we&apos;ll
          set up your workspace automatically.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Workspace</span>
          <span className="font-medium">{workspaceLabel || "My Workspace"}</span>
        </div>
        {preset && (
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">Focus</span>
            <span className="font-medium">
              {preset.emoji} {preset.label}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Account</span>
          <span className="font-medium">{initialEmail}</span>
        </div>
        <div className="border-t border-border/40 pt-3 flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium">Pro &mdash; $30/mo</span>
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
        onClick={handleCheckout}
        disabled={isLoading}
        className={cn(
          "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
          isLoading
            ? "cursor-wait bg-muted text-muted-foreground/50"
            : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
        )}
      >
        <CreditCard className="h-3.5 w-3.5" />
        {isLoading ? "Redirecting to Stripe..." : "Continue to payment"}
        {!isLoading && (
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        )}
      </button>

      <p className="text-[11px] text-muted-foreground/60">
        Secure payment via Stripe. Cancel anytime from your account settings.
      </p>
    </div>
  );
}
