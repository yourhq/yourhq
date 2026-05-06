"use client";

import { cn } from "@/lib/utils";

interface HqLogoProps {
  size?: number;
  className?: string;
}

export function HqLogo({ size = 24, className }: HqLogoProps) {
  const height = size;
  const width = Math.round(size * 2.2);

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 44 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-label="HQ"
    >
      <rect
        x="0.5"
        y="0.5"
        width="43"
        height="23"
        rx="5.5"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.25"
      />
      <text
        x="22"
        y="16.5"
        textAnchor="middle"
        fill="currentColor"
        fontSize="14"
        fontWeight="700"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        letterSpacing="0.05em"
      >
        HQ
      </text>
    </svg>
  );
}
