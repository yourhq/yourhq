"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { AlertCircle, ArrowRight, Mail, Check } from "lucide-react";
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
  if (description) {
    return description;
  }
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
    verification_failed: "Sign-in verification failed. The link may have expired — please request a new one.",
  };
  return messages[error] ?? `Sign-in failed: ${error}`;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022" />
      <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00" />
      <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900" />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

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
      setError(initialError);
      // Clean up URL so the error doesn't persist on refresh
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

  if (magicLinkSent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-[360px]">
          <div className="mb-10 flex flex-col items-center gap-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-500/10 ring-1 ring-green-500/20">
              <Mail className="h-5 w-5 text-green-600" />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
                Check your email
              </h1>
              <p className="text-[14px] leading-relaxed text-muted-foreground">
                We sent a sign-in link to{" "}
                <span className="font-medium text-foreground">{email}</span>
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-card/50 p-8 backdrop-blur-sm">
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/20">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div className="space-y-2">
                <p className="text-[14px] font-medium text-foreground">
                  Click the link in your email to sign in
                </p>
                <p className="text-[13px] text-muted-foreground">
                  The link will expire in 1 hour. Check your spam folder if you don&apos;t see it.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setMagicLinkSent(false);
                setEmail("");
                setError(null);
              }}
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-[360px]">
        {/* Logo + heading */}
        <div className="mb-10 flex flex-col items-center gap-5">
          <HqLogo size={28} className="text-foreground" />
          <div className="text-center space-y-2">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              Sign in to HQ
            </h1>
            <p className="text-[14px] text-muted-foreground">
              Your agent operations platform
            </p>
          </div>
        </div>

        {/* Social buttons */}
        <div className="space-y-2.5">
          <button
            type="button"
            disabled
            className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-border/60 bg-card text-[13px] font-medium text-foreground transition-all hover:bg-accent/50 hover:border-border disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GoogleIcon className="h-4 w-4" />
            Continue with Google
          </button>
          <button
            type="button"
            disabled
            className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-border/60 bg-card text-[13px] font-medium text-foreground transition-all hover:bg-accent/50 hover:border-border disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <MicrosoftIcon className="h-4 w-4" />
            Continue with Microsoft
          </button>
          <button
            type="button"
            disabled
            className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-border/60 bg-card text-[13px] font-medium text-foreground transition-all hover:bg-accent/50 hover:border-border disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <AppleIcon className="h-4 w-4" />
            Continue with Apple
          </button>
        </div>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-3 text-[12px] text-muted-foreground/70">
              or
            </span>
          </div>
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            ref={emailRef}
            id="email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
            autoComplete="email"
            className="h-10 rounded-lg border-border/60 bg-card placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-foreground/20"
          />

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
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
            {loading ? "Continuing..." : "Continue with email"}
            {!loading && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-8 text-center text-[12px] leading-relaxed text-muted-foreground/60">
          By continuing, you agree to our{" "}
          <a href="#" className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
