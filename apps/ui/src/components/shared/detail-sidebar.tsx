"use client";

// Right-rail sidebar used on entity detail pages (agents, gateways).
// Two exports — desktop and mobile — mirroring step-rail.tsx in
// onboarding so the page can place each one where it fits best.
//
//   <DetailSidebar>          a 280px sticky column, hidden below lg
//   <DetailSidebarTrigger>   a small button (typically in the page
//                             header) that opens the rail as a drawer
//                             on mobile
//
// Why split: the page renders both, controlling visibility via
// responsive utilities. They share <DetailSidebarSection> blocks for
// content so the desktop rail and mobile drawer always agree on
// what's inside.

import * as React from "react";
import { PanelRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface DetailSidebarProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailSidebar({ children, className }: DetailSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden w-[280px] shrink-0 flex-col border-l border-border/60 lg:flex",
        className,
      )}
    >
      <div className="flex flex-col divide-y divide-border/50">
        {children}
      </div>
    </aside>
  );
}

interface DetailSidebarMobileProps {
  /** Title shown in the mobile drawer header. */
  title: string;
  children: React.ReactNode;
}

export function DetailSidebarMobile({
  title,
  children,
}: DetailSidebarMobileProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:hidden"
          aria-label="Open details"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[300px] p-0 sm:max-w-[300px]"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <div className="flex h-full flex-col divide-y divide-border/50 overflow-y-auto pt-12">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Sidebar section blocks ──────────────────────────────────────────

interface DetailSidebarSectionProps {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function DetailSidebarSection({
  title,
  action,
  children,
  className,
}: DetailSidebarSectionProps) {
  return (
    <section className={cn("px-4 py-3.5", className)}>
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {title && (
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              {title}
            </h3>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// ─── Property grid (matches AgentDetail's grid-cols pattern) ─────────

interface DetailSidebarPropertyGridProps {
  children: React.ReactNode;
}

export function DetailSidebarPropertyGrid({
  children,
}: DetailSidebarPropertyGridProps) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-xs">
      {children}
    </div>
  );
}

interface DetailSidebarPropertyProps {
  label: string;
  children: React.ReactNode;
}

export function DetailSidebarProperty({
  label,
  children,
}: DetailSidebarPropertyProps) {
  return (
    <>
      <span className="py-0.5 text-muted-foreground">{label}</span>
      <span className="min-w-0 py-0.5">{children}</span>
    </>
  );
}
