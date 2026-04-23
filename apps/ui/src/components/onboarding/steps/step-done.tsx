"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepDoneProps {
  workspaceName: string;
  workspaceEmoji: string;
}

export function StepDone({ workspaceName, workspaceEmoji }: StepDoneProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Tiny delay to let the step transition land before kicking off the
    // "you made it" animation.
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-12 pt-16 text-center">
      {/* Hero — workspace emoji + check halo */}
      <div className="relative mx-auto w-fit">
        <div
          className={cn(
            "relative flex h-24 w-24 items-center justify-center rounded-2xl bg-card/60 text-[52px] transition-all duration-500 ease-out",
            mounted ? "scale-100 opacity-100" : "scale-90 opacity-0",
          )}
        >
          {workspaceEmoji}
          <div
            className={cn(
              "absolute -right-1.5 -top-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-emerald-500 shadow-lg transition-all duration-500 ease-out",
              mounted
                ? "scale-100 opacity-100 delay-200"
                : "scale-50 opacity-0",
            )}
          >
            <Check className="h-4 w-4 text-background" strokeWidth={3} />
          </div>
        </div>
      </div>

      <div
        className={cn(
          "space-y-3 transition-all duration-500",
          mounted
            ? "translate-y-0 opacity-100 delay-100"
            : "translate-y-2 opacity-0",
        )}
      >
        <h1 className="text-[32px] font-semibold tracking-tight">
          {workspaceName} is ready.
        </h1>
        <p className="mx-auto max-w-[42ch] text-[14px] leading-relaxed text-muted-foreground">
          Your workspace is live and your gateway is online. Let&apos;s
          create your first agent.
        </p>
      </div>

      <div
        className={cn(
          "flex flex-col items-center gap-4 transition-all duration-500",
          mounted
            ? "translate-y-0 opacity-100 delay-200"
            : "translate-y-2 opacity-0",
        )}
      >
        <Link
          href="/dashboard/agents"
          className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-[14px] font-medium text-background transition-all hover:bg-foreground/90"
        >
          <Sparkles className="h-4 w-4" />
          Create your first agent
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <Link
          href="/dashboard"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          Take me to the dashboard
        </Link>
      </div>

      <div
        className={cn(
          "mx-auto max-w-md space-y-3 pt-8 text-left transition-all duration-500",
          mounted
            ? "translate-y-0 opacity-100 delay-300"
            : "translate-y-2 opacity-0",
        )}
      >
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
          What&apos;s next
        </div>
        <div className="space-y-2">
          <NextLink
            href="/dashboard/settings/pipeline"
            title="Customize your pipeline"
            desc="Rename stages or add your own — we picked a starting point based on your context."
          />
          <NextLink
            href="/dashboard/settings/fields"
            title="Customize CRM fields"
            desc="Add the fields specific to how you work."
          />
          <NextLink
            href="/dashboard/settings/networking"
            title="Share HQ with other devices"
            desc="Install Tailscale to reach HQ from your phone."
          />
        </div>
      </div>
    </div>
  );
}

function NextLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-border/60 hover:bg-card/60"
    >
      <div className="flex-1 space-y-0.5">
        <div className="text-[13px] font-medium">{title}</div>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}
