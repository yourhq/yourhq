"use client";

// Sticky header used on entity detail pages (agents, gateways) above
// the tabs + main column + rail layout.
//
// Anatomy, left-to-right:
//   - Back link  (e.g. "← Agents")
//   - Identity   (avatar + name + status pill)
//   - Right side: secondaryActions (mobile rail trigger) + overflow ⋯
//
// Stays put when the body scrolls — gives the user persistent
// orientation about which entity they're looking at.

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface DetailHeaderProps {
  /** Back link target + label, e.g. { href: "/dashboard/agents", label: "Agents" }. */
  back: { href: string; label: string };
  /** The avatar / icon block. Caller sizes it (typ. h-7 w-7 or h-8 w-8). */
  identityIcon: React.ReactNode;
  /** Identity title slot — a string, an EditableLabel, etc. */
  identityTitle: React.ReactNode;
  /** Slot for status pill / slug / @handle next to the title. */
  identityMeta?: React.ReactNode;
  /** Right-side action slot (e.g. mobile rail trigger). */
  secondaryActions?: React.ReactNode;
  /** Right-side overflow menu trigger. */
  overflow?: React.ReactNode;
  className?: string;
}

export function DetailHeader({
  back,
  identityIcon,
  identityTitle,
  identityMeta,
  secondaryActions,
  overflow,
  className,
}: DetailHeaderProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 flex flex-col gap-1.5 border-b border-border/60 bg-background/95 px-5 py-3 backdrop-blur",
        className,
      )}
    >
      <div>
        <Link
          href={back.href}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          {back.label}
        </Link>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0">{identityIcon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 truncate text-[15px] font-semibold leading-tight text-foreground">
                {identityTitle}
              </h1>
            </div>
            {identityMeta && (
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {identityMeta}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {secondaryActions}
          {overflow}
        </div>
      </div>
    </div>
  );
}
