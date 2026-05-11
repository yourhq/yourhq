"use client";

import { useState } from "react";
import { useTaskTemplates } from "@/hooks/use-task-templates";
import { useStreams } from "@/hooks/use-streams";
import type { TaskTemplate } from "@/lib/tasks/types";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { LayoutTemplate, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";

interface TaskTemplateLauncherProps {
  onSpawned?: () => void;
}

export function TaskTemplateLauncher({ onSpawned }: TaskTemplateLauncherProps) {
  const { templates, loading, actions } = useTaskTemplates();
  const { streams } = useStreams();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TaskTemplate | null>(null);
  const [streamId, setStreamId] = useState<string>("none");
  const [spawning, setSpawning] = useState(false);

  if (loading || templates.length === 0) return null;

  async function handleSpawn() {
    if (!selected) return;
    setSpawning(true);
    const { data, error } = await actions.spawnFromTemplate(selected.id, {
      stream_id: streamId !== "none" ? streamId : undefined,
    });
    setSpawning(false);

    if (error) {
      toast.error("Failed to spawn tasks from template");
    } else {
      toast.success(`Created ${data?.length ?? 0} tasks from "${selected.name}"`);
      setOpen(false);
      setSelected(null);
      onSpawned?.();
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1.5"
        onClick={() => setOpen(true)}
      >
        <LayoutTemplate className="h-3.5 w-3.5" />
        From template
      </Button>

      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent className="sm:max-w-md">
          <ResponsiveDialogTitle className="text-base font-semibold">
            Spawn from template
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-xs text-muted-foreground">
            Select a template to create a set of related tasks.
          </ResponsiveDialogDescription>

          <div className="space-y-3 mt-3">
            {/* Template selection */}
            <div className="space-y-1.5">
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => setSelected(tmpl)}
                  className={`flex w-full items-center gap-3 rounded-md border p-2.5 text-left transition-colors ${
                    selected?.id === tmpl.id
                      ? "border-foreground/30 bg-accent/50"
                      : "border-border/40 hover:bg-accent/30"
                  }`}
                >
                  <LayoutTemplate className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{tmpl.name}</div>
                    {tmpl.description && (
                      <div className="text-xs text-muted-foreground truncate">{tmpl.description}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                      {tmpl.items.length} task{tmpl.items.length !== 1 ? "s" : ""}
                      {tmpl.items.some((i) => i.blocked_by?.length) && " with dependencies"}
                    </div>
                  </div>
                  {selected?.id === tmpl.id && (
                    <Check className="h-4 w-4 text-foreground shrink-0" />
                  )}
                </button>
              ))}
            </div>

            {/* Stream selector */}
            {selected && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Stream</label>
                <Select value={streamId} onValueChange={setStreamId}>
                  <SelectTrigger className="h-8 text-xs">
                    <span>
                      {streamId === "none"
                        ? "No stream"
                        : streams.find((s) => s.id === streamId)?.name ?? "Stream"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No stream</SelectItem>
                    {streams.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Preview */}
            {selected && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Tasks to create</label>
                <div className="rounded border border-border/40 bg-card/50 p-2 space-y-1">
                  {selected.items.map((item) => (
                    <div key={item.ref} className="flex items-center gap-2 text-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                      <span className="flex-1 truncate">{item.title}</span>
                      {item.blocked_by && item.blocked_by.length > 0 && (
                        <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
                          <ArrowRight className="h-2.5 w-2.5" />
                          {item.blocked_by.join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-1.5 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleSpawn}
                disabled={!selected || spawning}
              >
                {spawning ? "Creating..." : `Create ${selected?.items.length ?? 0} tasks`}
              </Button>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
