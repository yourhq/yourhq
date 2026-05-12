"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Mail,
  Check,
  Bot,
  Zap,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HqLogo } from "@/components/shared/hq-logo";
import { hostedAuthAction } from "./actions";

function getHashError(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || !hash.includes("error")) return null;

  const params = new URLSearchParams(hash.slice(1));
  const errorCode = params.get("error_code");
  const description = params.get("error_description")?.replace(/\+/g, " ");

  if (errorCode === "otp_expired") {
    return "Your sign-in link has expired. Please request a new one.";
  }
  if (description) return description;
  const error = params.get("error");
  if (error === "access_denied") {
    return "Access denied. Please try signing in again.";
  }
  return error ? `Sign-in failed: ${error}` : null;
}

function getQueryError(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (!error) return null;

  const messages: Record<string, string> = {
    missing_token: "Invalid sign-in link. Please request a new one.",
    no_workspace: "No workspace found. Please sign in again.",
    verification_failed:
      "Sign-in verification failed. The link may have expired — please request a new one.",
  };
  return messages[error] ?? `Sign-in failed: ${error}`;
}

const FEATURES = [
  {
    icon: Bot,
    title: "Deploy AI agents",
    description: "Agents that research, write, and take action — each with their own browser and desktop.",
  },
  {
    icon: Zap,
    title: "Ready in 60 seconds",
    description: "Pick a template, connect your AI provider, and your first agent is live.",
  },
  {
    icon: Shield,
    title: "Your data, your control",
    description: "Each workspace runs in an isolated environment with its own database.",
  },
];

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hashErr = getHashError();
    const queryErr = getQueryError();
    const initialError = hashErr || queryErr;
    if (initialError) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(initialError);
      if (window.location.hash || window.location.search) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
    emailRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await hostedAuthAction(email);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    if (result.isNewUser) {
      router.push("/onboarding");
      return;
    }

    setMagicLinkSent(true);
    setLoading(false);
  }

  // ── Magic link sent state ──
  if (magicLinkSent) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <Mail className="h-6 w-6 text-emerald-500" />
            </div>

            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Check your email
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a sign-in link to{" "}
              <span className="font-medium text-foreground">{email}</span>
            </p>

            <div className="mt-8 w-full rounded-xl border border-border/50 bg-muted/30 px-6 py-5">
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10">
                  <Check className="h-4 w-4 text-emerald-500" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  Click the link in your email to sign in
                </p>
                <p className="text-xs text-muted-foreground">
                  The link expires in 1 hour. Check spam if you don&apos;t see
                  it.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setMagicLinkSent(false);
                setEmail("");
                setError(null);
              }}
              className="mt-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main auth form ──
  return (
    <div className="flex min-h-svh bg-background">
      {/* Left panel */}
      <div className="relative hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.03] via-transparent to-foreground/[0.06]" />
        <div className="absolute bottom-0 left-0 right-0 h-[400px] bg-gradient-to-t from-foreground/[0.04] to-transparent" />
        <div className="absolute right-0 top-0 bottom-0 w-px bg-border/40" />

        <div className="relative flex flex-1 flex-col justify-between px-10 py-8 xl:px-12">
          <HqLogo size={24} className="text-foreground/80" />

          <div className="space-y-12 py-8">
            <div className="space-y-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/60">
                Agent operations platform
              </p>
              <h2 className="text-[28px] font-semibold leading-[1.2] tracking-tight text-foreground">
                Deploy agents that
                <br />
                work alongside you
              </h2>
              <p className="text-[15px] leading-relaxed text-muted-foreground max-w-[34ch]">
                Each agent gets their own browser, desktop, and tools — managed from a single dashboard.
              </p>
            </div>

            <div className="space-y-1">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="group flex items-start gap-4 rounded-xl px-4 py-3.5 transition-colors hover:bg-foreground/[0.03]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/80 shadow-sm">
                    <f.icon className="h-4 w-4 text-foreground/60" />
                  </div>
                  <div className="space-y-0.5 pt-0.5">
                    <p className="text-[13px] font-medium text-foreground">
                      {f.title}
                    </p>
                    <p className="text-[12px] leading-relaxed text-muted-foreground/70">
                      {f.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground/30">
            yourhq.ai
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[340px]">
          {/* Mobile logo */}
          <HqLogo size={24} className="mb-8 text-foreground lg:hidden" />

          <div className="space-y-1.5">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              Get started
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your email to sign in or create an account
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-3">
            <input
              ref={emailRef}
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              autoComplete="email"
              className={cn(
                "block h-11 w-full rounded-lg border border-border/50 bg-muted/20 px-4 text-sm text-foreground outline-none transition-all",
                "placeholder:text-muted-foreground/40",
                "focus:border-foreground/30 focus:bg-muted/30 focus:ring-2 focus:ring-foreground/5",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />

            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-3 text-xs text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 leading-relaxed">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all",
                "bg-foreground text-background",
                "hover:opacity-90 active:scale-[0.98]",
                loading && "cursor-wait opacity-60",
              )}
            >
              {loading ? "Continuing..." : "Continue"}
              {!loading && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </form>

          {/* Mobile features */}
          <div className="mt-10 space-y-2 lg:hidden">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/10 px-4 py-3"
              >
                <f.icon className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {f.title}
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground/70">
                    {f.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground/30">
            By continuing, you agree to our{" "}
            <a
              href="#"
              className="text-muted-foreground/50 transition-colors hover:text-foreground hover:underline underline-offset-4"
            >
              Terms
            </a>{" "}
            and{" "}
            <a
              href="#"
              className="text-muted-foreground/50 transition-colors hover:text-foreground hover:underline underline-offset-4"
            >
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
