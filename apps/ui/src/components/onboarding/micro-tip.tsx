"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { useOnboardingProgress } from "@/hooks/use-onboarding-progress";
import { cn } from "@/lib/utils";

interface MicroTipProps {
  tipKey: string;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}

const POSITION_CLASSES: Record<string, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

export function MicroTip({
  tipKey,
  content,
  position = "top",
  children,
}: MicroTipProps) {
  const { progress, markTipSeen } = useOnboardingProgress();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const alreadySeen = progress.microTipsSeen.includes(tipKey);
  const shouldShow = progress.wizardCompleted && !progress.dismissedAt && !alreadySeen;

  useEffect(() => {
    if (!shouldShow) return;
    const showTimer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(showTimer);
  }, [shouldShow]);

  useEffect(() => {
    if (!visible) return;
    timerRef.current = setTimeout(() => {
      setVisible(false);
      markTipSeen(tipKey);
    }, 12000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, tipKey, markTipSeen]);

  useEffect(() => {
    if (!visible) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setVisible(false);
        markTipSeen(tipKey);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [visible, tipKey, markTipSeen]);

  return (
    <div className="relative inline-block">
      {children}
      {visible && (
        <div
          role="tooltip"
          onClick={(e) => {
            e.stopPropagation();
            setVisible(false);
            markTipSeen(tipKey);
          }}
          className={cn(
            "absolute z-50 w-48 cursor-pointer animate-in fade-in zoom-in-95 duration-200",
            POSITION_CLASSES[position],
          )}
        >
          <div className="rounded-lg border border-border/60 bg-popover px-3 py-2.5 shadow-lg backdrop-blur-sm">
            <p className="text-[12px] text-popover-foreground/90 leading-relaxed">{content}</p>
          </div>
        </div>
      )}
    </div>
  );
}
