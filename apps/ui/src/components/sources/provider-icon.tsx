"use client";

import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProviderIconProps {
  provider: string;
  className?: string;
}

export function ProviderIcon({ provider, className }: ProviderIconProps) {
  const base = cn(
    "inline-flex items-center justify-center rounded font-semibold shrink-0",
    className,
  );

  switch (provider) {
    case "notion":
      return (
        <span
          className={cn(base, "bg-foreground/10 text-foreground text-[10px]")}
          style={{ width: "1em", height: "1em", fontSize: "inherit" }}
          title="Notion"
        >
          N
        </span>
      );
    case "google_drive":
      return (
        <span
          className={cn(base, "bg-blue-500/20 text-blue-400 text-[10px]")}
          style={{ width: "1em", height: "1em", fontSize: "inherit" }}
          title="Google Drive"
        >
          G
        </span>
      );
    default:
      return <Globe className={cn("text-muted-foreground", className)} />;
  }
}
