"use client";

// Non-unmounting inline sign-in dialog. Shown when:
//   1. The user's session for the current project expired (mid-session).
//   2. The user just switched to a project they have no session for.
//   3. An API request returned 401 and auth needs to be restored without
//      navigating away from the current page.
//
// Unlike routing to /login, this keeps whatever the user was doing on
// screen underneath the modal. On success, sessions are stashed by the
// browser Supabase client (per-project localStorage key), the modal
// closes, and the page's Supabase queries re-run naturally.

import { useEffect, useRef, useState } from "react";
import { LogIn, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SignInModalProps {
  /** True when the modal should be shown. Controlled by the auth hook. */
  open: boolean;
  /** Called after a successful sign-in. The caller typically refreshes the
   * page router so server components re-render against the fresh session. */
  onSuccess: () => void;
  /**
   * The workspace the user is signing into. Shown in the title so they
   * know which project's credentials they need.
   */
  workspaceLabel: string;
  workspaceEmoji: string;
  /** Optional: prefill the email field (e.g., from the last sign-in). */
  defaultEmail?: string;
}

export function SignInModal({
  open,
  onSuccess,
  workspaceLabel,
  workspaceEmoji,
  defaultEmail = "",
}: SignInModalProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Reset password / error when the modal opens for a new workspace.
  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      // Auto-focus the right field: email if empty, password otherwise.
      const t = setTimeout(() => {
        if (!email) emailRef.current?.focus();
        else {
          const el = document.getElementById(
            "sign-in-modal-password",
          ) as HTMLInputElement | null;
          el?.focus();
        }
      }, 50);
      return () => clearTimeout(t);
    }
  }, [open, workspaceLabel, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(prettyError(error.message));
        setSubmitting(false);
        return;
      }
      setPassword("");
      onSuccess();
    } catch (err) {
      setError((err as Error).message ?? "Sign-in failed");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        // No close button — user must sign in or explicitly pick a
        // different workspace. Preventing escape/outside-click is the
        // whole point of "don't kick the user out."
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-[18px]">
              {workspaceEmoji}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-[15px]">
                Sign in to {workspaceLabel}
              </DialogTitle>
              <DialogDescription className="text-[12px]">
                Each workspace has its own account.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="sign-in-modal-email" className="text-[12px]">
              Email
            </Label>
            <Input
              id="sign-in-modal-email"
              ref={emailRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sign-in-modal-password" className="text-[12px]">
              Password
            </Label>
            <Input
              id="sign-in-modal-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="submit" disabled={submitting || !email || !password}>
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="h-3.5 w-3.5 mr-1.5" />
                  Sign in
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function prettyError(msg: string): string {
  if (/invalid.*login|invalid.*credentials/i.test(msg)) {
    return "Email or password doesn't match.";
  }
  if (/email not confirmed/i.test(msg)) {
    return "This account hasn't been confirmed in Supabase. Confirm it in the Supabase dashboard.";
  }
  return msg;
}
