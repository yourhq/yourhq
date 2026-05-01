"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, AlertCircle, Check } from "lucide-react";
import { hostedLoginAction } from "./actions";

export function LoginForm({ mode }: { mode: "oss" | "hosted" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const router = useRouter();

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
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
              <Check className="h-5 w-5" />
            </div>
            <div className="text-center">
              <h1 className="text-title">Check your email</h1>
              <p className="text-caption text-muted-foreground">
                We sent a sign-in link to <strong>{email}</strong>
              </p>
            </div>
          </div>
          <div className="rounded-md border border-border/60 bg-card p-6 shadow-sm text-center">
            <p className="text-body text-muted-foreground">
              Click the link in your email to sign in. You can close this tab.
            </p>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => {
                setMagicLinkSent(false);
                setEmail("");
              }}
            >
              Try a different email
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-foreground/95 to-foreground/80 text-background shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="text-center">
            <h1 className="text-title">HQ</h1>
            <p className="text-caption text-muted-foreground">
              Sign in to continue
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border/60 bg-card p-6 shadow-sm">
          <form
            onSubmit={mode === "hosted" ? handleHostedLogin : handleOssLogin}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[12px]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                autoFocus
                autoComplete="email"
              />
            </div>

            {mode === "oss" && (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[12px]">
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
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-body text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? mode === "hosted"
                  ? "Sending link…"
                  : "Signing in…"
                : mode === "hosted"
                  ? "Send sign-in link"
                  : "Sign in"}
            </Button>
          </form>
        </div>

        {mode === "hosted" && (
          <p className="text-center text-caption text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a href="/signup" className="text-foreground underline underline-offset-4">
              Get started
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
