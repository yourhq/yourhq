"use client";

import { cn } from "@/lib/utils";

interface StaggeredEntranceProps {
  index: number;
  children: React.ReactNode;
  className?: string;
}

export function StaggeredEntrance({ index, children, className }: StaggeredEntranceProps) {
  return (
    <div
      className={cn("animate-in fade-in slide-in-from-bottom-2 duration-300", className)}
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: "backwards" }}
    >
      {children}
    </div>
  );
}
