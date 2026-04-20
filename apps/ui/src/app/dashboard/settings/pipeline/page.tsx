"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PipelineStage, DEFAULT_STAGE_COLOR } from "@/lib/fields/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Plus, Trash2, GripVertical, Layers } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { logAudit } from "@/lib/audit/log";
import { toast } from "sonner";

const ENTITY_TYPES = [
  { value: "contact", label: "Contacts" },
  { value: "organization", label: "Organizations" },
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .slice(0, 40);
}

function StageEditor({ entityType }: { entityType: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_STAGE_COLOR);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
    // Clear existing default
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
    setNewColor(DEFAULT_STAGE_COLOR);
    setAdding(false);
    fetchStages();
  }

  async function moveStage(id: string, delta: -1 | 1) {
    const index = stages.findIndex((s) => s.id === id);
    if (index === -1) return;
    const swapIndex = index + delta;
    if (swapIndex < 0 || swapIndex >= stages.length) return;
    const a = stages[index];
    const b = stages[swapIndex];
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .update({ sort_order: b.sort_order })
        .eq("id", a.id),
      supabase
        .from("pipeline_stages")
        .update({ sort_order: a.sort_order })
        .eq("id", b.id),
    ]);
    fetchStages();
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
      <div className="space-y-1">
        {stages.map((stage, i) => (
          <div
            key={stage.id}
            className="group flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5"
          >
            <div className="flex flex-col">
              <button
                type="button"
                className="h-3 text-muted-foreground/40 hover:text-foreground disabled:opacity-20"
                disabled={i === 0}
                onClick={() => moveStage(stage.id, -1)}
                aria-label="Move up"
              >
                <GripVertical className="h-3 w-3" />
              </button>
            </div>

            <input
              type="color"
              value={stage.color ?? DEFAULT_STAGE_COLOR}
              onChange={(e) => updateStage(stage.id, { color: e.target.value })}
              className="h-6 w-6 rounded cursor-pointer bg-transparent border-0"
            />

            <Input
              value={stage.label}
              onChange={(e) => updateStage(stage.id, { label: e.target.value })}
              className="h-7 text-xs flex-1"
            />

            <span className="text-[10px] text-muted-foreground font-mono w-24 truncate">
              {stage.stage_key}
            </span>

            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                <Switch
                  checked={stage.is_terminal}
                  onCheckedChange={(v) => updateStage(stage.id, { is_terminal: v })}
                />
                Terminal
              </label>
            </div>

            <Button
              variant={stage.is_default ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setDefault(stage.id)}
              disabled={stage.is_default}
            >
              {stage.is_default ? "Default" : "Set default"}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => setConfirmDeleteId(stage.id)}
              aria-label="Delete stage"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

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
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-6 w-6 rounded cursor-pointer bg-transparent border-0"
          />
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
        description="Stages drive status dropdowns and kanban columns across the app."
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
