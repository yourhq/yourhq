"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Mail,
  Lock,
  UserPlus,
  LogIn,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@supabase/ssr";
import {
  createAuthUserAction,
  markAccountDone,
} from "@/app/onboarding/actions";

export interface StepAccountProps {
  // The Supabase project we just connected. We need URL + anonKey to
  // sign in client-side (so the session cookie lands immediately) and
  // serviceRoleKey + projectId so we can call the create-user admin
  // action server-side.
  url: string;
  anonKey: string;
  projectId: string;
  defaultEmail: string;
  workspaceLabel: string;
  workspaceEmoji: string;
  onComplete: () => void;
  /**
   * Called when the user explicitly signs out of an existing session
   * via "Use a different account." The wizard uses this to roll the
   * rail's completion state back so Account re-shows as in-progress.
   */
  onSignOut?: () => void;
}

type Mode = "create" | "signin";

export function StepAccount({
  url,
  anonKey,
  projectId,
  defaultEmail,
  workspaceLabel,
  workspaceEmoji,
  onComplete,
  onSignOut,
}: StepAccountProps) {
  const [mode, setMode] = useState<Mode>("create");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The browser client tied to this project's cookie prefix. Memoized
  // so the session probe + signIn share the same client instance.
  const client = useMemo(() => {
    if (!url || !anonKey || !projectId) return null;
    const cookiePrefix = `hq-${projectId.slice(0, 8)}`;
    return createBrowserClient(url, anonKey, {
      cookieOptions: { name: cookiePrefix },
    });
  }, [url, anonKey, projectId]);

  // Session probe — when the user revisits this step after already
  // signing in, we don't want to make them re-authenticate. We probe
  // the browser Supabase client; if it returns a session, render a
  // summary card instead of the form.
  // Initial value is derived synchronously: "none" when there's no
  // client to query, "checking" otherwise — avoids a setState-in-effect.
  const [sessionState, setSessionState] = useState<
    | { status: "checking" }
    | { status: "none" }
    | { status: "active"; email: string }
  >(() => (client ? { status: "checking" } : { status: "none" }));

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void client.auth.getSession().then((res) => {
      if (cancelled) return;
      const session = res.data.session;
      if (session?.user?.email) {
        setSessionState({ status: "active", email: session.user.email });
      } else {
        setSessionState({ status: "none" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (sessionState.status !== "none") return;
    const t = setTimeout(() => emailRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [sessionState.status]);

  // Sign in via the memoized browser client — same per-project cookie
  // prefix as the SignInModal uses post-onboarding.
  const signIn = async (
    inputEmail: string,
    inputPassword: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!client) {
      return { ok: false, error: "Supabase client not ready." };
    }
    try {
      const { error } = await client.auth.signInWithPassword({
        email: inputEmail,
        password: inputPassword,
      });
      if (error) {
        if (/invalid.*credentials|invalid.*login/i.test(error.message)) {
          return { ok: false, error: "Email or password doesn't match." };
        }
        if (/email not confirmed/i.test(error.message)) {
          return {
            ok: false,
            error:
              "This account exists but isn't confirmed. Confirm it in the Supabase dashboard, then try again.",
          };
        }
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  };

  const signOutCurrentSession = async () => {
    if (!client) return;
    await client.auth.signOut().catch(() => {});
    setSessionState({ status: "none" });
    setMode("signin");
    onSignOut?.();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError(null);

    if (mode === "create") {
      // Try to create. If Supabase says "already exists," flip to sign-in
      // mode automatically — the user keeps their typed email + password
      // and just clicks Sign in.
      const r = await createAuthUserAction({
        url,
        anonKey,
        serviceRoleKey: "", // server-side reads from registry
        authEmail: email.trim(),
        authPassword: password,
      });
      if (!r.ok) {
        if (r.alreadyExists) {
          setMode("signin");
          setError(
            "An account with this email already exists. Sign in below.",
          );
          setSubmitting(false);
          return;
        }
        setError(r.error ?? "Couldn't create account");
        setSubmitting(false);
        return;
      }
      // Account created — now sign in to get a session cookie.
      const s = await signIn(email.trim(), password);
      if (!s.ok) {
        setError(s.error ?? "Account created but sign-in failed.");
        setSubmitting(false);
        return;
      }
      await markAccountDone({ email: email.trim(), mode: "created" });
      onComplete();
      return;
    }

    // Sign-in path
    const s = await signIn(email.trim(), password);
    if (!s.ok) {
      setError(s.error ?? "Sign-in failed");
      setSubmitting(false);
      return;
    }
    await markAccountDone({ email: email.trim(), mode: "signed_in" });
    onComplete();
  };

  const submitLabel =
    mode === "create"
      ? submitting
        ? "Creating account…"
        : "Create account"
      : submitting
        ? "Signing in…"
        : "Sign in";

  const ModeIcon = mode === "create" ? UserPlus : LogIn;

  // ── Loading: probing for an existing session ────────────────────────
  // Render a low-contrast skeleton of the form rather than a centered
  // spinner — same vertical rhythm, fades into the real form when the
  // probe resolves, no layout shift.
  if (sessionState.status === "checking") {
    return (
      <div className="space-y-10 pt-8" aria-busy="true">
        <div className="space-y-3">
          <div className="h-3 w-20 rounded bg-muted/40" />
          <div className="h-8 w-3/5 rounded bg-muted/30" />
          <div className="h-4 w-4/5 rounded bg-muted/20" />
        </div>
        <div className="space-y-5">
          <div className="space-y-2.5">
            <div className="h-3 w-12 rounded bg-muted/30" />
            <div className="h-7 w-full rounded bg-muted/20" />
          </div>
          <div className="space-y-2.5">
            <div className="h-3 w-16 rounded bg-muted/30" />
            <div className="h-7 w-full rounded bg-muted/20" />
          </div>
        </div>
      </div>
    );
  }

  // ── Summary: user already has an active session for this project ────
  if (sessionState.status === "active") {
    return (
      <div className="space-y-10 pt-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-[15px]">
              {workspaceEmoji}
            </div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
              {workspaceLabel}
            </div>
          </div>
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
            You&apos;re signed in.
          </h1>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
            HQ has an active session for this workspace. Continue when
            you&apos;re ready, or sign in with a different account.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[13px] font-medium leading-tight">
                Signed in
              </div>
              <div className="truncate text-[12px] text-muted-foreground">
                {sessionState.email}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={async () => {
              await markAccountDone({
                email: sessionState.email,
                mode: "signed_in",
              });
              onComplete();
            }}
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background hover:bg-foreground/90"
          >
            Continue
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            type="button"
            onClick={signOutCurrentSession}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            Use a different account
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-10 pt-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-[15px]">
            {workspaceEmoji}
          </div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            {workspaceLabel}
          </div>
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          {mode === "create"
            ? "Create your sign-in."
            : "Sign in to your workspace."}
        </h1>
        <p className="max-w-[46ch] text-[14px] leading-relaxed text-muted-foreground">
          {mode === "create"
            ? "Now let's set up how you'll log in to HQ. Each workspace has its own credentials."
            : "Use the email and password you set up in this Supabase project."}
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            Email
          </label>
          <input
            ref={emailRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full border-0 border-b border-border/60 bg-transparent pb-2 text-[16px] outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground"
            required
          />
        </div>

        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "create" ? "At least 6 characters" : "••••••••"}
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            minLength={mode === "create" ? 6 : 1}
            className="w-full border-0 border-b border-border/60 bg-transparent pb-2 text-[16px] outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground"
            required
          />
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting || !email.trim() || !password}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
            submitting || !email.trim() || !password
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ModeIcon className="h-3.5 w-3.5" />
          )}
          {submitLabel}
          {!submitting && (
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "create" ? "signin" : "create"));
            setError(null);
          }}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          {mode === "create"
            ? "I already have an account →"
            : "← Back to creating an account"}
        </button>
      </div>
    </form>
  );
}
