"use client";

import { useState, useCallback } from "react";
import { ArrowRight, Loader2, Eye, EyeOff, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { StaggeredEntrance } from "./staggered-entrance";

export interface StepAccountProps {
  ownerName?: string;
  agentName?: string;
  agentEmoji?: string;
  onSubmit: (data: { email: string; password: string }) => void;
  pending: boolean;
  error?: string | null;
}

export function StepAccount({
  ownerName,
  agentName,
  agentEmoji,
  onSubmit,
  pending,
  error,
}: StepAccountProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const emailValid = email.includes("@") && email.includes(".");
  const passwordLong = password.length >= 6;
  const valid = emailValid && passwordLong;

  const handleSubmit = useCallback(() => {
    if (!valid || pending) return;
    onSubmit({ email: email.trim(), password });
  }, [valid, pending, email, password, onSubmit]);

  return (
    <div className="space-y-8">
      <StaggeredEntrance index={0}>
        <div className="space-y-2">
          <h1 className="text-[24px] md:text-[28px] font-semibold leading-[1.15] tracking-tight">
            Create your login
          </h1>
          <p className="max-w-[48ch] text-[14px] leading-relaxed text-muted-foreground">
            Almost done — set up the email and password you&apos;ll use to sign
            in to your workspace.
          </p>
        </div>
      </StaggeredEntrance>

      <StaggeredEntrance index={1}>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label
              htmlFor="account-email"
              className="text-[13px] font-medium text-foreground"
            >
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
              className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const pw = document.getElementById("account-password");
                  if (!emailValid) return;
                  if (!passwordLong && pw) {
                    pw.focus();
                    return;
                  }
                  handleSubmit();
                }
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="account-password"
              className="text-[13px] font-medium text-foreground"
            >
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
                className="flex h-10 w-full rounded-lg border border-border/60 bg-background pl-3 pr-10 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            {password.length > 0 && !passwordLong && (
              <p className="text-[11px] text-muted-foreground/60 animate-in fade-in duration-150">
                {6 - password.length} more character{6 - password.length !== 1 ? "s" : ""} needed
              </p>
            )}
          </div>
        </div>
      </StaggeredEntrance>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive animate-in fade-in duration-150">
          {error}
        </div>
      )}

      <StaggeredEntrance index={2}>
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!valid || pending}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2",
              !valid || pending
                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                : "bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.97]",
            )}
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creating account…
              </>
            ) : (
              <>
                Finish setup
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>

          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
            <Shield className="h-3 w-3 shrink-0" />
            Stored in your local Supabase database. No data is sent to HQ.
          </p>
        </div>
      </StaggeredEntrance>

      {(agentName || ownerName) && (
        <StaggeredEntrance index={3}>
          <div className="rounded-xl border border-border/30 bg-card/30 px-4 py-3.5">
            <div className="text-[11px] font-medium text-muted-foreground/50 mb-2">
              Ready to launch
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] sm:text-[13px]">
              {agentName && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] leading-none">{agentEmoji || "🤖"}</span>
                  <span className="font-medium text-foreground/80">
                    {agentName}
                  </span>
                </div>
              )}
              {ownerName && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground/60">for</span>
                  <span className="font-medium text-foreground/80">
                    {ownerName}
                  </span>
                </div>
              )}
            </div>
          </div>
        </StaggeredEntrance>
      )}
    </div>
  );
}
