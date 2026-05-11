"use client";

import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROVIDER_MANIFESTS } from "@/lib/sources/generated-manifests";

interface ProviderIconProps {
  provider: string;
  className?: string;
}

export function ProviderIcon({ provider, className }: ProviderIconProps) {
  const manifest = PROVIDER_MANIFESTS[provider];

  if (!manifest) {
    return <Globe className={cn("text-muted-foreground", className)} />;
  }

  const base = cn(
    "inline-flex items-center justify-center rounded font-semibold shrink-0",
    className,
  );

  return (
    <span
      className={cn(base, "bg-foreground/10 text-foreground text-[10px]")}
      style={{ width: "1em", height: "1em", fontSize: "inherit" }}
      title={manifest.name}
    >
      {manifest.icon}
    </span>
  );
}
