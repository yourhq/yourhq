"use client";

// Linear-style left rail for the onboarding wizard. Always-visible on
// desktop (≥1024px); collapses to a top pill + bottom-sheet drawer on
// smaller screens.
//
// State per step:
//   - done       (✓, clickable, jumps to that step)
//   - current    (●, no-op when clicked)
//   - active-bg  (current step has a faint background)
//   - future     (○, muted, not clickable)
//   - busy       (animated spinner, e.g. gateway is provisioning while
//                 the user navigated elsewhere)

import { useState } from "react";
import { Check, Circle, Loader2, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepRailItem {
  id: string;
  label: string;
  /** Sub-label (e.g. "Connect a database") shown under the title. */
  hint?: string;
  status: "done" | "current" | "future";
  /** True when background work is happening on a step the user has navigated away from. */
  busy?: boolean;
}

export interface StepRailProps {
  items: StepRailItem[];
  onJump: (id: string) => void;
  /** A small label shown above the list (e.g. "Setup"). */
  title?: string;
  /** Brand wordmark element. */
  brand?: React.ReactNode;
}

export function StepRail({
  items,
  onJump,
  title = "Setup",
  brand,
}: StepRailProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Desktop rail
  const desktop = (
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-border/40 bg-background/40 lg:flex">
      <div className="flex h-14 items-center px-5">
        {brand ?? (
          <span className="text-[13px] font-semibold tracking-tight">HQ</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-3 py-4">
        <div className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
          {title}
        </div>
        {items.map((item, i) => (
          <RailItem
            key={item.id}
            item={item}
            index={i + 1}
            onJump={onJump}
          />
        ))}
      </div>
    </aside>
  );

  // Mobile pill — sits in the top header
  const current = items.find((i) => i.status === "current");
  const currentIdx = items.findIndex((i) => i.status === "current");
  const mobile = (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-[12px] font-medium hover:bg-background lg:hidden"
        aria-label="Open step menu"
      >
        <Menu className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Step {currentIdx + 1} of {items.length}</span>
        <span className="hidden text-foreground sm:inline">·</span>
        <span className="hidden text-foreground sm:inline">{current?.label}</span>
      </button>

      {/* Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur lg:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-14 items-center justify-between px-5">
            <span className="text-[13px] font-semibold tracking-tight">{title}</span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-full p-2 hover:bg-accent/60"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-1 px-3 py-2">
            {items.map((item, i) => (
              <RailItem
                key={item.id}
                item={item}
                index={i + 1}
                onJump={(id) => {
                  setDrawerOpen(false);
                  onJump(id);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {desktop}
      {mobile}
    </>
  );
}

function RailItem({
  item,
  index,
  onJump,
}: {
  item: StepRailItem;
  index: number;
  onJump: (id: string) => void;
}) {
  const clickable = item.status === "done";
  const Tag = clickable ? "button" : "div";
  const interactive = clickable
    ? "cursor-pointer hover:bg-accent/40"
    : item.status === "current"
      ? "bg-accent/30"
      : "cursor-default";

  return (
    <Tag
      type={clickable ? "button" : undefined}
      onClick={clickable ? () => onJump(item.id) : undefined}
      disabled={!clickable && item.status !== "current"}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors",
        interactive,
      )}
    >
      <StepIndicator status={item.status} busy={item.busy} index={index} />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[13px] leading-tight",
            item.status === "current"
              ? "font-semibold text-foreground"
              : item.status === "done"
                ? "font-medium text-foreground/85"
                : "font-medium text-muted-foreground/60",
          )}
        >
          {item.label}
        </div>
        {item.hint && (
          <div
            className={cn(
              "mt-0.5 truncate text-[11px] leading-tight",
              item.status === "future"
                ? "text-muted-foreground/40"
                : "text-muted-foreground",
            )}
          >
            {item.hint}
          </div>
        )}
      </div>
    </Tag>
  );
}

function StepIndicator({
  status,
  busy,
  index,
}: {
  status: StepRailItem["status"];
  busy?: boolean;
  index: number;
}) {
  if (busy) {
    return (
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
    );
  }
  if (status === "done") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "current") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <span className="text-[9px] font-semibold leading-none">{index}</span>
      </span>
    );
  }
  // future
  return (
    <Circle
      className="h-4 w-4 shrink-0 text-muted-foreground/30"
      strokeWidth={1.5}
    />
  );
}
