"use client";

import {
  MoreHorizontal,
  Trash2,
  Webhook,
  Package,
  Shield,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PLUGIN_SOURCE_META, type HQPlugin } from "@/lib/plugins/types";
import { cn } from "@/lib/utils";

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> =
  {
    builtin: Shield,
    local: Package,
    webhook: Webhook,
    marketplace: Store,
  };

interface PluginRowProps {
  plugin: HQPlugin;
  isFirst: boolean;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  onSelect: () => void;
}

export function PluginRow({
  plugin,
  isFirst,
  onToggle,
  onRemove,
  onSelect,
}: PluginRowProps) {
  const sourceMeta = PLUGIN_SOURCE_META[plugin.source];
  const Icon = SOURCE_ICONS[plugin.source] ?? Package;
  const hookCount = plugin.hooks.length;

  return (
    <div
      className={cn(
        "group relative flex h-16 cursor-pointer items-center gap-3 px-3 transition-colors hover:bg-muted/20",
        !isFirst && "border-t border-border/50",
      )}
      onClick={onSelect}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="max-w-[220px] truncate text-[13px] font-medium text-foreground">
            {plugin.name}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: sourceMeta.color }}
            />
            {sourceMeta.label}
          </span>
          <span className="text-[11px] text-muted-foreground/50">
            v{plugin.version}
          </span>
        </div>
        {plugin.description ? (
          <span className="max-w-[360px] truncate text-[11px] text-muted-foreground/70">
            {plugin.description}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/50">
            {hookCount} event{hookCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div
        className="flex shrink-0 items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Switch
          checked={plugin.is_enabled}
          onCheckedChange={onToggle}
          aria-label={plugin.is_enabled ? "Disable plugin" : "Enable plugin"}
        />
      </div>

      <div
        className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {plugin.source !== "builtin" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Plugin actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onRemove();
                }}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
