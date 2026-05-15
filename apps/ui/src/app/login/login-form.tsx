"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, AlertCircle, Check, ArrowRight, Mail } from "lucide-react";
import { hostedLoginAction } from "./actions";
import { cn } from "@/lib/utils";

export function LoginForm({ mode }: { mode: "oss" | "hosted" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function handleOssLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let supabase;
    try {
      supabase = createClient();
    } catch {
      setError("Workspace not configured — complete setup first.");
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleHostedLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await hostedLoginAction(email);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    setMagicLinkSent(true);
    setLoading(false);
  }

  if (magicLinkSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-status-success/10 text-status-success">
              <Mail className="h-[18px] w-[18px]" />
            </div>
            <div className="text-center space-y-1">
              <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
                Check your email
              </h1>
              <p className="text-[13px] text-muted-foreground">
                We sent a sign-in link to{" "}
                <span className="font-medium text-foreground">{email}</span>
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-success/10">
                <Check className="h-5 w-5 text-status-success" />
              </div>
              <div className="space-y-1.5">
                <p className="text-[13px] text-foreground">
                  Click the link in your email to sign in.
                </p>
                <p className="text-[12px] text-muted-foreground">
                  The link will expire in 1 hour.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 text-center">
            <button
              onClick={() => {
                setMagicLinkSent(false);
                setEmail("");
                setError(null);
              }}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-[400px]">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
            <Sparkles className="h-[18px] w-[18px]" />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
              Sign in to HQ
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {mode === "hosted"
                ? "Enter your email to receive a sign-in link."
                : "Enter your credentials to continue."}
            </p>
          </div>
        </div>

        {/* Form card */}
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
          <form
            onSubmit={mode === "hosted" ? handleHostedLogin : handleOssLogin}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-[12px] font-medium text-muted-foreground"
              >
                Email
              </Label>
              <Input
                ref={emailRef}
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                autoComplete="email"
                className="h-10"
              />
            </div>

            {mode === "oss" && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="text-[12px] font-medium text-muted-foreground"
                >
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  autoComplete="current-password"
                  className="h-10"
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-all",
                "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98]",
                loading && "opacity-70 cursor-wait",
              )}
            >
              {loading
                ? mode === "hosted"
                  ? "Sending link…"
                  : "Signing in…"
                : mode === "hosted"
                  ? "Send sign-in link"
                  : "Sign in"}
              {!loading && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </form>
        </div>

        {/* Footer */}
        {mode === "hosted" && (
          <p className="mt-5 text-center text-[12px] text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a
              href="/signup"
              className="text-foreground underline underline-offset-4 hover:no-underline"
            >
              Get started
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
