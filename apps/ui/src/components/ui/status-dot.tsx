import { cn } from "@/lib/utils";

interface StatusDotProps {
  color: string;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  label?: string;
  className?: string;
}

export function StatusDot({
  color,
  size = "md",
  pulse = false,
  label,
  className,
}: StatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "shrink-0 rounded-full",
          size === "sm" && "h-1.5 w-1.5",
          size === "md" && "h-2 w-2",
          size === "lg" && "h-2.5 w-2.5",
          pulse && "animate-pulse"
        )}
        style={{ backgroundColor: color }}
      />
      {label && (
        <span className="text-[13px] text-foreground truncate">{label}</span>
      )}
    </span>
  );
}

interface StatusPillProps {
  color: string;
  label: string;
  className?: string;
  size?: "sm" | "md";
}

export function StatusPill({
  color,
  label,
  className,
  size = "md",
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" && "h-5 px-2 text-[11px]",
        size === "md" && "h-6 px-2.5 text-[11px]",
        className
      )}
      style={{
        backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`,
        color: color,
      }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
