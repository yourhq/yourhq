"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import type { ColumnToggleItem } from "@/lib/columns/types";

interface ColumnToggleProps {
  items: ColumnToggleItem[];
  onToggle: (columnId: string) => void;
  onReset: () => void;
}

export function ColumnToggle({ items, onToggle, onReset }: ColumnToggleProps) {
  const standardItems = items.filter((i) => i.group === "standard");
  const customItems = items.filter((i) => i.group === "custom");
  const hasCustom = customItems.length > 0;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Columns</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
          Toggle columns
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {standardItems.map((item) => (
          <DropdownMenuCheckboxItem
            key={item.id}
            checked={item.visible}
            onCheckedChange={() => onToggle(item.id)}
            disabled={item.locked}
            onSelect={(e) => e.preventDefault()}
            className="text-[12px]"
          >
            {item.label}
          </DropdownMenuCheckboxItem>
        ))}
        {hasCustom && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
              Custom fields
            </DropdownMenuLabel>
            {customItems.map((item) => (
              <DropdownMenuCheckboxItem
                key={item.id}
                checked={item.visible}
                onCheckedChange={() => onToggle(item.id)}
                onSelect={(e) => e.preventDefault()}
                className="text-[12px]"
              >
                {item.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onReset}
          className="text-[12px] text-muted-foreground"
        >
          <RotateCcw className="mr-2 h-3 w-3" />
          Reset to default
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
