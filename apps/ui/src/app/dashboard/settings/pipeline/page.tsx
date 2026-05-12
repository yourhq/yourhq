"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import { PipelineStage, DEFAULT_STAGE_COLOR, STAGE_COLORS } from "@/lib/fields/types";
import { slugify, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Trash2, GripVertical, Layers } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { logAudit } from "@/lib/audit/log";
import { toast } from "sonner";

const ENTITY_TYPES = [
  { value: "contact", label: "Contacts" },
  { value: "organization", label: "Organizations" },
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-6 w-6 rounded-full border border-border/50 shrink-0 transition-transform hover:scale-110"
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-6 gap-1.5">
          {STAGE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={cn(
                "h-6 w-6 rounded-full transition-transform hover:scale-110",
                value === c && "ring-2 ring-ring ring-offset-2 ring-offset-background"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SortableStageRow({
  stage,
  onUpdate,
  onSetDefault,
  onDelete,
}: {
  stage: PipelineStage;
  onUpdate: (patch: Partial<PipelineStage>) => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5",
        isDragging && "opacity-50 bg-accent/30"
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <ColorPicker
        value={stage.color ?? DEFAULT_STAGE_COLOR}
        onChange={(c) => onUpdate({ color: c })}
      />

      <Input
        value={stage.label}
        onChange={(e) => onUpdate({ label: e.target.value })}
        className="h-7 text-xs flex-1"
      />

      <span className="text-[10px] text-muted-foreground font-mono w-24 truncate">
        {stage.stage_key}
      </span>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
              <Switch
                checked={stage.is_terminal}
                onCheckedChange={(v) => onUpdate({ is_terminal: v })}
              />
              Terminal
            </label>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] text-xs">
            Terminal stages will not appear as active columns in Kanban view
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={stage.is_default ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={onSetDefault}
              disabled={stage.is_default}
            >
              {stage.is_default ? "Default" : "Set default"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] text-xs">
            Default stage is auto-assigned to new records
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Button
        variant="ghost"
        size="icon-sm"
        className="opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onDelete}
        aria-label="Delete stage"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function StageEditor({ entityType }: { entityType: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(STAGE_COLORS[8]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const fetchStages = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("entity_type", entityType)
      .order("sort_order", { ascending: true });
    if (data) setStages(data as PipelineStage[]);
    setLoading(false);
  }, [supabase, entityType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStages();
  }, [fetchStages]);

  async function updateStage(id: string, patch: Partial<PipelineStage>) {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { error } = await supabase
      .from("pipeline_stages")
      .update(patch)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update stage");
      fetchStages();
      return;
    }
    logAudit(supabase, {
      module: "settings",
      entity_type: "pipeline_stage",
      entity_id: id,
      action: "updated",
      summary: `Updated pipeline stage`,
    });
  }

  async function setDefault(id: string) {
    await supabase
      .from("pipeline_stages")
      .update({ is_default: false })
      .eq("entity_type", entityType)
      .eq("is_default", true);
    await supabase.from("pipeline_stages").update({ is_default: true }).eq("id", id);
    fetchStages();
  }

  async function deleteStage(id: string) {
    await supabase.from("pipeline_stages").delete().eq("id", id);
    logAudit(supabase, {
      module: "settings",
      entity_type: "pipeline_stage",
      entity_id: id,
      action: "deleted",
      summary: `Deleted pipeline stage`,
    });
    fetchStages();
  }

  async function createStage() {
    if (!newLabel.trim()) return;
    const stage_key = slugify(newLabel);
    if (!stage_key) {
      toast.error("Invalid label");
      return;
    }
    const nextOrder = stages.length > 0 ? Math.max(...stages.map((s) => s.sort_order)) + 10 : 10;
    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert({
        entity_type: entityType,
        stage_key,
        label: newLabel.trim(),
        color: newColor,
        sort_order: nextOrder,
        is_terminal: false,
        is_default: stages.length === 0,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message ?? "Failed to create stage");
      return;
    }
    if (data) {
      logAudit(supabase, {
        module: "settings",
        entity_type: "pipeline_stage",
        entity_id: data.id,
        action: "created",
        summary: `Created pipeline stage '${newLabel}'`,
      });
    }
    setNewLabel("");
    setNewColor(STAGE_COLORS[8]);
    setAdding(false);
    fetchStages();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...stages];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    setStages(reordered);

    await Promise.all(
      reordered.map((s, i) =>
        supabase
          .from("pipeline_stages")
          .update({ sort_order: (i + 1) * 10 })
          .eq("id", s.id)
      )
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={stages.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {stages.map((stage) => (
              <SortableStageRow
                key={stage.id}
                stage={stage}
                onUpdate={(patch) => updateStage(stage.id, patch)}
                onSetDefault={() => setDefault(stage.id)}
                onDelete={() => setConfirmDeleteId(stage.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <ConfirmDeleteDialog
        open={!!confirmDeleteId}
        onConfirm={() => {
          if (confirmDeleteId) deleteStage(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
        title="Delete pipeline stage?"
        description="Contacts or organizations currently using this stage will keep the raw status value, but it will stop appearing in dropdowns."
      />

      {adding ? (
        <div className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5">
          <ColorPicker value={newColor} onChange={setNewColor} />
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createStage();
              if (e.key === "Escape") {
                setAdding(false);
                setNewLabel("");
              }
            }}
            placeholder="Stage label"
            autoFocus
            className="h-7 text-xs flex-1"
          />
          <Button size="sm" className="h-7 text-xs" onClick={createStage}>
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setAdding(false);
              setNewLabel("");
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add stage
        </Button>
      )}
    </div>
  );
}

export default function PipelineSettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Layers className="h-4 w-4" />}
        title="Pipeline stages"
        description="Stages drive status dropdowns and kanban columns across the app. Drag to reorder."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-3xl p-5">
          <Tabs defaultValue="contact">
            <TabsList variant="line" className="h-10">
              {ENTITY_TYPES.map((e) => (
                <TabsTrigger key={e.value} value={e.value} className="text-[13px]">
                  {e.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {ENTITY_TYPES.map((e) => (
              <TabsContent key={e.value} value={e.value} className="pt-5">
                <StageEditor entityType={e.value} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
