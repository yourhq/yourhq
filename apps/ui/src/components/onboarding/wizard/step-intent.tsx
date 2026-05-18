"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { StaggeredEntrance } from "./staggered-entrance";

export interface StepIntentProps {
  ownerName: string;
  initialKey?: string | null;
  onSubmit: (intentKey: string) => void;
  pending: boolean;
}

interface IntentOption {
  key: string;
  label: string;
  detail: string;
}

const INTENT_OPTIONS: IntentOption[] = [
  {
    key: "reach",
    label: "Sales & outreach",
    detail: "Prospects, deals, partnerships, networking",
  },
  {
    key: "publish",
    label: "Creating content",
    detail: "Newsletters, posts, threads, publishing",
  },
  {
    key: "run",
    label: "Managing clients",
    detail: "Accounts, deliverables, projects",
  },
  {
    key: "hire",
    label: "Hiring people",
    detail: "Sourcing, screening, interviews",
  },
  {
    key: "research",
    label: "Doing research",
    detail: "Markets, companies, trends, analysis",
  },
  {
    key: "organized",
    label: "Staying organized",
    detail: "Tasks, contacts, notes, a bit of everything",
  },
];

export function StepIntent({
  ownerName,
  initialKey,
  onSubmit,
  pending,
}: StepIntentProps) {
  const [selected, setSelected] = useState<string | null>(initialKey ?? null);
  const [confirming, setConfirming] = useState(false);

  const _firstName = ownerName.split(" ")[0] || "there";

  const handleSelect = useCallback(
    (key: string) => {
      if (pending || confirming) return;
      setSelected(key);
      setConfirming(true);
      setTimeout(() => onSubmit(key), 350);
    },
    [pending, confirming, onSubmit],
  );

  return (
    <div className="space-y-8">
      <StaggeredEntrance index={0}>
        <div className="space-y-2">
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
            What best describes your work?
          </h1>
          <p className="text-[14px] text-muted-foreground">
            We&apos;ll tailor your workspace and recommend the right agent.
          </p>
        </div>
      </StaggeredEntrance>

      <StaggeredEntrance index={1}>
        <div role="radiogroup" aria-label="Choose your focus" className="-mx-3">
          {INTENT_OPTIONS.map((option) => {
            const isSelected = selected === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleSelect(option.key)}
                disabled={confirming && !isSelected}
                className={cn(
                  "group flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                  isSelected
                    ? "bg-foreground/[0.08]"
                    : confirming
                      ? "opacity-20 cursor-default"
                      : "hover:bg-foreground/[0.04] cursor-pointer",
                )}
              >
                <span
                  className={cn(
                    "text-[15px] font-medium transition-colors duration-200",
                    isSelected
                      ? "text-foreground"
                      : "text-foreground/80 group-hover:text-foreground",
                  )}
                >
                  {option.label}
                </span>
                <span
                  className={cn(
                    "text-[13px] transition-colors duration-200",
                    isSelected
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60 group-hover:text-muted-foreground/80",
                  )}
                >
                  {option.detail}
                </span>
              </button>
            );
          })}
        </div>
      </StaggeredEntrance>

      <StaggeredEntrance index={2}>
        <button
          type="button"
          onClick={() => handleSelect("explore")}
          disabled={pending || confirming}
          className={cn(
            "text-[13px] text-muted-foreground/60 transition-colors hover:text-foreground",
            (pending || confirming) && "pointer-events-none opacity-20",
          )}
        >
          Skip, I&apos;ll set things up myself
        </button>
      </StaggeredEntrance>
    </div>
  );
}
