"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

interface StepCelebrationProps {
  workspaceName?: string;
  agentName?: string;
  agentEmoji?: string;
  needsManualLogin?: boolean;
  onContinue: () => void;
}

export function StepCelebration({
  workspaceName,
  agentName,
  agentEmoji,
  needsManualLogin,
  onContinue,
}: StepCelebrationProps) {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowContent(true), 300);
    const t2 = needsManualLogin ? undefined : setTimeout(onContinue, 3000);
    return () => {
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [onContinue, needsManualLogin]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      {/* Animated checkmark */}
      <div className="mb-6">
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          fill="none"
          className="text-status-success"
        >
          <circle
            cx="32"
            cy="32"
            r="30"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.2"
          />
          <circle
            cx="32"
            cy="32"
            r="30"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="188.5"
            strokeDashoffset="188.5"
            strokeLinecap="round"
            style={{
              animation: "check-draw 0.6s ease-out 0.2s forwards",
            }}
          />
          <path
            d="M20 33 L28 41 L44 25"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="40"
            strokeDashoffset="40"
            style={{
              animation: "check-draw 0.4s ease-out 0.7s forwards",
            }}
          />
        </svg>
      </div>

      {showContent && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
            Welcome to {workspaceName || "your workspace"}
          </h1>
          {agentName && !needsManualLogin && (
            <p className="text-[14px] text-muted-foreground">
              {agentEmoji && <span className="mr-1">{agentEmoji}</span>}
              {agentName} is ready to help.
            </p>
          )}
          {needsManualLogin && (
            <p className="text-[14px] text-muted-foreground">
              We sent a sign-in link to your email. Check your inbox to access your workspace.
            </p>
          )}
          <div className="pt-4">
            <button
              type="button"
              onClick={onContinue}
              className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background transition-all hover:bg-foreground/90 active:scale-[0.97]"
            >
              {needsManualLogin ? "Go to sign in" : "Go to dashboard"}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
