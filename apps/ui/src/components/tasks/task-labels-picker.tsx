"use client";

import { useState } from "react";
import { useLabels } from "@/hooks/use-labels";
import type { Label } from "@/lib/tasks/types";
import { LABEL_PRESET_COLORS } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Plus, Tag } from "lucide-react";

interface TaskLabelsPickerProps {
  taskId: string;
  selectedLabels: Label[];
  onLabelsChange: (labels: Label[]) => void;
}

export function TaskLabelsPicker({
  taskId,
  selectedLabels,
  onLabelsChange,
}: TaskLabelsPickerProps) {
  const { labels, actions } = useLabels();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LABEL_PRESET_COLORS[0]);

  const selectedIds = new Set(selectedLabels.map((l) => l.id));

  const filtered = search.trim()
    ? labels.filter((l) =>
        l.name.toLowerCase().includes(search.toLowerCase())
      )
    : labels;

  async function toggleLabel(label: Label) {
    if (selectedIds.has(label.id)) {
      await actions.removeLabelFromTask(taskId, label.id);
      onLabelsChange(selectedLabels.filter((l) => l.id !== label.id));
    } else {
      await actions.addLabelToTask(taskId, label.id);
      onLabelsChange([...selectedLabels, label]);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const { data } = await actions.createLabel(newName.trim(), newColor);
    if (data) {
      await actions.addLabelToTask(taskId, data.id);
      onLabelsChange([...selectedLabels, data]);
      setNewName("");
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="h-8 sm:h-6 flex items-center gap-1 border border-border/50 bg-transparent px-2.5 sm:px-2 text-xs font-normal hover:bg-accent rounded-md transition-colors">
          {selectedLabels.length > 0 ? (
            <div className="flex items-center gap-1 max-w-[140px]">
              {selectedLabels.slice(0, 2).map((l) => (
                <span key={l.id} className="flex items-center gap-1 truncate">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="truncate">{l.name}</span>
                </span>
              ))}
              {selectedLabels.length > 2 && (
                <span className="text-muted-foreground/60">
                  +{selectedLabels.length - 2}
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1">
              <Tag className="h-3 w-3" />
              Labels
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" portal={false} align="start">
        <div className="p-2 border-b border-border/40">
          <Input
            placeholder="Filter labels..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
          />
        </div>

        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.map((label) => (
            <button
              key={label.id}
              onClick={() => toggleLabel(label)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/40 transition-colors"
            >
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: label.color }}
              />
              <span className="flex-1 text-left truncate">{label.name}</span>
              {selectedIds.has(label.id) && (
                <Check className="h-3 w-3 text-foreground shrink-0" />
              )}
            </button>
          ))}
          {filtered.length === 0 && !creating && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No labels found
            </p>
          )}
        </div>

        <div className="border-t border-border/40 p-1">
          {creating ? (
            <div className="space-y-2 p-2">
              <Input
                placeholder="Label name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-7 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
              />
              <div className="flex flex-wrap gap-1">
                {LABEL_PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={cn(
                      "h-5 w-5 rounded-full transition-all",
                      newColor === color && "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-xs"
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                >
                  Create
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" />
              Create label
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface TaskLabelPillsProps {
  labels: Label[];
  max?: number;
  className?: string;
}

export function TaskLabelPills({ labels, max = 2, className }: TaskLabelPillsProps) {
  if (!labels || labels.length === 0) return null;

  const visible = labels.slice(0, max);
  const overflow = labels.length - max;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {visible.map((l) => (
        <span
          key={l.id}
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] bg-accent/40"
        >
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: l.color }}
          />
          <span className="truncate max-w-[60px]">{l.name}</span>
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground/60">+{overflow}</span>
      )}
    </div>
  );
}
