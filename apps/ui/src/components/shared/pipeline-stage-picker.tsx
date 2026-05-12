"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { DEFAULT_STAGE_COLOR, STAGE_COLORS } from "@/lib/fields/types";
import { slugify, cn } from "@/lib/utils";
import { logAudit } from "@/lib/audit/log";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Plus, X } from "lucide-react";

interface PipelineStagePickerProps {
  entityType: string;
  value: string | null;
  onValueChange: (stageKey: string | null) => void;
  allowNone?: boolean;
  triggerClassName?: string;
  compact?: boolean;
}

export function PipelineStagePicker({
  entityType,
  value,
  onValueChange,
  allowNone = false,
  triggerClassName,
  compact = false,
}: PipelineStagePickerProps) {
  const { stages, stagesByKey, getStageColor, getStageLabel } =
    usePipelineStages(entityType);
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(STAGE_COLORS[8]);

  const currentStage = value ? stagesByKey[value] : null;

  async function handleCreate() {
    const label = newLabel.trim();
    if (!label) return;

    const stage_key = slugify(label);
    if (!stage_key) return;

    const nextOrder =
      stages.length > 0
        ? Math.max(...stages.map((s) => s.sort_order)) + 10
        : 10;

    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert({
        entity_type: entityType,
        stage_key,
        label,
        color: newColor,
        sort_order: nextOrder,
        is_terminal: false,
        is_default: stages.length === 0,
      })
      .select()
      .single();

    if (error) return;

    if (data) {
      logAudit(supabase, {
        module: "settings",
        entity_type: "pipeline_stage",
        entity_id: data.id,
        action: "created",
        summary: `Created pipeline stage '${label}' inline`,
      });
    }

    onValueChange(stage_key);
    setNewLabel("");
    setCreating(false);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-transparent text-xs transition-colors hover:bg-accent",
            compact ? "h-6 px-2" : "h-8 px-2.5",
            triggerClassName
          )}
        >
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{
              backgroundColor: value
                ? getStageColor(value)
                : DEFAULT_STAGE_COLOR,
            }}
          />
          <span className="truncate">
            {currentStage?.label ?? (value ? getStageLabel(value) : "Status")}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[200px] p-1"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {allowNone && (
          <button
            type="button"
            onClick={() => {
              onValueChange(null);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-3 w-3" />
            No status
          </button>
        )}

        {stages.map((s) => (
          <button
            key={s.stage_key}
            type="button"
            onClick={() => {
              onValueChange(s.stage_key);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-accent",
              s.stage_key === value && "bg-accent"
            )}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: s.color ?? DEFAULT_STAGE_COLOR }}
            />
            <span className="flex-1 text-left truncate">{s.label}</span>
            {s.stage_key === value && (
              <Check className="h-3 w-3 text-foreground shrink-0" />
            )}
          </button>
        ))}

        <div className="border-t border-border/50 mt-1 pt-1">
          {creating ? (
            <div className="p-1.5 space-y-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewLabel("");
                  }
                }}
                placeholder="Stage name"
                autoFocus
                className="h-7 text-xs"
              />
              <div className="flex flex-wrap gap-1">
                {STAGE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={cn(
                      "h-5 w-5 rounded-full transition-transform hover:scale-110",
                      newColor === c &&
                        "ring-2 ring-ring ring-offset-1 ring-offset-background"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => {
                    setCreating(false);
                    setNewLabel("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={handleCreate}
                  disabled={!newLabel.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" />
              Create stage
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
