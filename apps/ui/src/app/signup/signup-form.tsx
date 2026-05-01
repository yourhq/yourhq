"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, AlertCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { CONTEXT_PRESETS } from "@/lib/setup/templates";
import { cn } from "@/lib/utils";
import { createCheckoutAction } from "./actions";

interface SignupData {
  email: string;
  ownerName: string;
  workspaceLabel: string;
  workspaceEmoji: string;
  contextPreset: string;
}

const EMOJI_OPTIONS = ["🏠", "🚀", "💼", "🧪", "🎯", "⚡", "🌊", "🔥", "🏗️", "🧠"];

export function SignupForm() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<SignupData>({
    email: "",
    ownerName: "",
    workspaceLabel: "",
    workspaceEmoji: "🏠",
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
      fd.set("emoji", data.workspaceEmoji);
      fd.set("contextPreset", data.contextPreset);
      await createCheckoutAction(fd);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-foreground/95 to-foreground/80 text-background shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="text-center">
            <h1 className="text-title">Get started with HQ</h1>
            <p className="text-caption text-muted-foreground">
              $30/month per workspace. Cancel anytime.
            </p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-6 bg-foreground" : i < step ? "w-1.5 bg-foreground/40" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>

        <div className="rounded-md border border-border/60 bg-card p-6 shadow-sm">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[12px]">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={data.email}
                  onChange={(e) => patch({ email: e.target.value })}
                  autoFocus
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ownerName" className="text-[12px]">Your name</Label>
                <Input
                  id="ownerName"
                  type="text"
                  placeholder="Jane Smith"
                  value={data.ownerName}
                  onChange={(e) => patch({ ownerName: e.target.value })}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="label" className="text-[12px]">Workspace name</Label>
                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      value={data.workspaceEmoji}
                      onChange={(e) => patch({ workspaceEmoji: e.target.value })}
                      className="h-9 w-12 cursor-pointer appearance-none rounded-md border border-border/60 bg-background text-center text-lg focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {EMOJI_OPTIONS.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </div>
                  <Input
                    id="label"
                    type="text"
                    placeholder="My Workspace"
                    value={data.workspaceLabel}
                    onChange={(e) => patch({ workspaceLabel: e.target.value })}
                    autoComplete="off"
                    className="flex-1"
                  />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!data.email || !data.ownerName}
                onClick={() => setStep(1)}
              >
                Continue
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-body font-medium">
                  What will you use HQ for{data.ownerName ? `, ${data.ownerName.split(" ")[0]}` : ""}?
                </p>
                <p className="text-caption text-muted-foreground mt-1">
                  We&apos;ll pre-configure your pipeline, fields, and task streams.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {CONTEXT_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => patch({ contextPreset: preset.key })}
                    className={cn(
                      "group relative flex flex-col gap-2 rounded-xl border p-3 text-left transition-all duration-150",
                      data.contextPreset === preset.key
                        ? "border-foreground/80 bg-foreground/[0.04]"
                        : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg text-[15px] transition-all",
                        data.contextPreset === preset.key ? "bg-foreground/[0.08]" : "bg-muted/60",
                      )}>
                        {preset.emoji}
                      </span>
                      <span className="text-[13px] font-semibold leading-tight">{preset.label}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {preset.description}
                    </p>
                    {data.contextPreset === preset.key && (
                      <div className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-foreground" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  <ArrowLeft className="mr-2 h-3.5 w-3.5" />
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!data.contextPreset}
                  onClick={() => setStep(2)}
                >
                  Continue
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center space-y-2 py-2">
                <span className="text-3xl">{data.workspaceEmoji}</span>
                <p className="text-body font-medium">{data.workspaceLabel || "My Workspace"}</p>
                <p className="text-caption text-muted-foreground">{data.email}</p>
                <p className="text-caption text-muted-foreground">
                  {CONTEXT_PRESETS.find((p) => p.key === data.contextPreset)?.label ?? "Custom"}
                  {" "}preset
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-body text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0">{error}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
                  <ArrowLeft className="mr-2 h-3.5 w-3.5" />
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCheckout}
                  disabled={loading}
                >
                  {loading ? "Redirecting to checkout…" : "Continue to checkout"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-caption text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="text-foreground underline underline-offset-4">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
