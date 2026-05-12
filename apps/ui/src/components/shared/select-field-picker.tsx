"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FieldDefinition } from "@/lib/fields/types";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, Plus, X } from "lucide-react";

interface SelectFieldPickerProps {
  field: FieldDefinition;
  value: string | null;
  onValueChange: (value: string | null) => void;
  className?: string;
}

export function SelectFieldPicker({
  field,
  value,
  onValueChange,
  className,
}: SelectFieldPickerProps) {
  const supabase = useMemo(() => createClient(), []);
  const options = field.options ?? [];

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOption, setNewOption] = useState("");

  async function handleCreate() {
    const opt = newOption.trim();
    if (!opt) return;
    if (options.includes(opt)) {
      onValueChange(opt);
      setNewOption("");
      setCreating(false);
      setOpen(false);
      return;
    }

    const updated = [...options, opt];
    await supabase
      .from("field_definitions")
      .update({ options: updated })
      .eq("id", field.id);

    onValueChange(opt);
    setNewOption("");
    setCreating(false);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-between gap-1.5 rounded-md border border-border/50 bg-transparent h-9 px-2.5 text-sm transition-colors hover:bg-accent w-full",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {value || `Select ${field.label.toLowerCase()}...`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* Clear option */}
        <button
          type="button"
          onClick={() => {
            onValueChange(null);
            setOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
          <X className="h-3 w-3" />
          None
        </button>

        {options.length > 0 && (
          <div className="border-t border-border/50 my-1 pt-1">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onValueChange(opt);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-accent",
                  opt === value && "bg-accent"
                )}
              >
                <span className="flex-1 text-left truncate">{opt}</span>
                {opt === value && (
                  <Check className="h-3 w-3 text-foreground shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-border/50 mt-1 pt-1">
          {creating ? (
            <div className="p-1.5 flex items-center gap-1.5">
              <Input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewOption("");
                  }
                }}
                placeholder="New option"
                autoFocus
                className="h-7 text-xs flex-1"
              />
              <Button
                size="sm"
                className="h-7 text-[11px] px-2"
                onClick={handleCreate}
                disabled={!newOption.trim()}
              >
                Add
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add option
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
