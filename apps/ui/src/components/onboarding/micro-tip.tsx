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

const ARROW_CLASSES: Record<string, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-border/80",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-border/80",
  left: "left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-border/80",
  right: "right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-border/80",
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
    const showTimer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(showTimer);
  }, [shouldShow]);

  useEffect(() => {
    if (!visible) return;
    timerRef.current = setTimeout(() => {
      setVisible(false);
      markTipSeen(tipKey);
    }, 8000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, tipKey, markTipSeen]);

  const handleDismiss = () => {
    setVisible(false);
    markTipSeen(tipKey);
  };

  return (
    <div className="relative inline-block" onClick={visible ? handleDismiss : undefined}>
      {children}
      {visible && (
        <div
          className={cn(
            "absolute z-50 w-48 animate-in fade-in zoom-in-95 duration-200",
            POSITION_CLASSES[position],
          )}
        >
          <div className="rounded-lg border border-border/80 bg-popover px-3 py-2 shadow-md">
            <p className="text-[11px] text-popover-foreground leading-relaxed">{content}</p>
          </div>
          <div className={cn("absolute h-0 w-0 border-[5px]", ARROW_CLASSES[position])} />
        </div>
      )}
    </div>
  );
}
