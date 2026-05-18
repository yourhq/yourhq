"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface HqLogoProps {
  size?: number;
  className?: string;
}

export function HqLogo({ size = 24, className }: HqLogoProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <div className={cn("flex items-center gap-2 shrink-0", className)}>
      <div
        className="relative"
        style={{ width: size, height: size }}
      >
        <Image
          src="/logo-light.png"
          alt="HQ"
          width={size}
          height={size}
          className="absolute inset-0 transition-opacity duration-300"
          style={{ opacity: mounted && !isDark ? 1 : 0 }}
          priority
        />
        <Image
          src="/logo-dark.png"
          alt="HQ"
          width={size}
          height={size}
          className="absolute inset-0 transition-opacity duration-300"
          style={{ opacity: mounted && isDark ? 1 : 0 }}
          priority
        />
      </div>
      <span className="text-base font-semibold tracking-[0.08em]">
        HQ
      </span>
    </div>
  );
}
