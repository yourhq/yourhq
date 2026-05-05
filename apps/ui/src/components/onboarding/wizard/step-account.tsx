"use client";

import { useState, useCallback } from "react";
import { ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepAccountProps {
  ownerName?: string;
  onSubmit: (data: { email: string; password: string }) => void;
  pending: boolean;
  error?: string | null;
}

export function StepAccount({ ownerName, onSubmit, pending, error }: StepAccountProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const valid = email.includes("@") && email.includes(".") && password.length >= 6;

  const handleSubmit = useCallback(() => {
    if (!valid || pending) return;
    onSubmit({ email: email.trim(), password });
  }, [valid, pending, email, password, onSubmit]);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Your account
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Create your login
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          {ownerName
            ? `Almost there, ${ownerName}! Create an account to access your workspace.`
            : "Almost there! Create an account to access your workspace."}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="account-email" className="text-[13px] font-medium text-foreground">
            Email
          </label>
          <input
            id="account-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
            autoComplete="email"
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="account-password" className="text-[13px] font-medium text-foreground">
            Password
          </label>
          <div className="relative">
            <input
              id="account-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              className="flex h-10 w-full rounded-lg border border-border/60 bg-background pl-3 pr-10 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground/50">
            This is your private workspace — only you will have this login.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!valid || pending}
        className={cn(
          "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
          !valid || pending
            ? "cursor-not-allowed bg-muted text-muted-foreground/50"
            : "bg-foreground text-background hover:bg-foreground/90",
        )}
      >
        {pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Setting up…
          </>
        ) : (
          <>
            Finish setup
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>
    </div>
  );
}
