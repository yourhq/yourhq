"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Routine, TriggerType, RoutineCadenceType, RoutineCondition, RoutineEntityType } from "@/lib/routines/types";
import { CADENCE_OPTIONS, SUB_DAILY_PRESETS, CONDITION_LABELS, ENTITY_TYPE_LABELS, DAYS_OF_WEEK_LABELS } from "@/lib/routines/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { logAudit } from "@/lib/audit/log";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoutineFormProps {
  editingRoutine: Routine | null;
  initialValues?: {
    agentId?: string;
    lockAgent?: boolean;
    triggerType?: TriggerType;
  };
  onSave: () => void;
  onCancel: () => void;
}

interface AgentOption {
  id: string;
  slug: string;
  name: string;
  emoji?: string;
}

const TEMPLATE_VARS = [
  { token: "{name}", hint: "Entity name" },
  { token: "{old_value}", hint: "Previous value" },
  { token: "{new_value}", hint: "New value" },
];

export function RoutineForm({
  editingRoutine,
  initialValues,
  onSave,
  onCancel,
}: RoutineFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [saving, setSaving] = useState(false);
  const { stageOptions, stagesByKey } = usePipelineStages("contact");

  const lockAgent = !editingRoutine && Boolean(initialValues?.lockAgent);

  const [name, setName] = useState(editingRoutine?.name ?? "");
  const [triggerType, setTriggerType] = useState<TriggerType>(
    editingRoutine?.trigger_type ?? initialValues?.triggerType ?? "schedule"
  );
  const [agentId, setAgentId] = useState(
    editingRoutine?.agent_id ?? initialValues?.agentId ?? ""
  );
  const [instruction, setInstruction] = useState(editingRoutine?.instruction ?? "");
  const [isActive, setIsActive] = useState(editingRoutine?.is_active ?? true);

  // Schedule fields
  const [cadenceType, setCadenceType] = useState<RoutineCadenceType>(
    editingRoutine?.cadence_type ?? "daily"
  );
  const [intervalN, setIntervalN] = useState(editingRoutine?.interval_n ?? 1);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(editingRoutine?.days_of_week ?? []);
  const [dayOfMonth, setDayOfMonth] = useState(editingRoutine?.day_of_month ?? 1);
  const [timeOfDay, setTimeOfDay] = useState(editingRoutine?.time_of_day ?? "09:00");
  const [timezone, setTimezone] = useState(
    editingRoutine?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  // Event fields
  const [entityType, setEntityType] = useState(editingRoutine?.entity_type ?? "contact");
  const [field, setField] = useState(editingRoutine?.field ?? "status");
  const [condition, setCondition] = useState<RoutineCondition>(
    editingRoutine?.condition ?? "created"
  );
  const [value, setValue] = useState(editingRoutine?.value ?? "");
  const [collectionId, setCollectionId] = useState<string | null>(
    editingRoutine?.collection_id ?? null
  );

  const [collections, setCollections] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [collectionFields, setCollectionFields] = useState<{ field_key: string; label: string; field_type: string; options: unknown }[]>([]);

  const instructionRef = useRef<HTMLTextAreaElement>(null);

  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Australia/Sydney", "UTC"];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [agentsRes, colsRes] = await Promise.all([
        supabase.from("agents").select("id, slug, name, meta").order("name", { ascending: true }),
        supabase.from("collection_definitions").select("id, name, slug").is("archived_at", null).order("name", { ascending: true }),
      ]);
      if (cancelled) return;
      if (agentsRes.data) {
        setAgents(
          agentsRes.data.map((a: { id: string; slug: string; name: string; meta: Record<string, unknown> | null }) => ({
            id: a.id,
            slug: a.slug,
            name: a.name,
            emoji: (a.meta as { emoji?: string } | null)?.emoji,
          }))
        );
      }
      if (colsRes.data) setCollections(colsRes.data);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    if (entityType !== "collection_record" || !collectionId) {
      setCollectionFields([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("collection_fields")
      .select("field_key, label, field_type, options")
      .eq("collection_id", collectionId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data) setCollectionFields(data);
      });
    return () => { cancelled = true; };
  }, [supabase, entityType, collectionId]);

  const selectedAgent = agents.find((a) => a.id === agentId) ?? null;

  const cadenceOption = CADENCE_OPTIONS.find((c) => c.value === cadenceType);
  const showValue = condition === "changed_to" || condition === "changed_from";

  const canSubmit =
    !!agentId &&
    name.trim().length > 0 &&
    (triggerType === "schedule"
      ? !!cadenceType && !!timezone
      : !!entityType && !!condition && (!showValue || value.trim().length > 0));

  function insertToken(token: string) {
    const el = instructionRef.current;
    if (!el) {
      setInstruction((s) => s + token);
      return;
    }
    const start = el.selectionStart ?? instruction.length;
    const end = el.selectionEnd ?? instruction.length;
    const next = instruction.slice(0, start) + token + instruction.slice(end);
    setInstruction(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function applyPreset(preset: typeof SUB_DAILY_PRESETS[number]) {
    setCadenceType(preset.cadence_type);
    setIntervalN(preset.interval_n);
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);

    const agent = agents.find((a) => a.id === agentId);
    const payload: Record<string, unknown> = {
      name: name.trim(),
      agent_id: agentId,
      agent_slug: agent?.slug ?? "",
      instruction: instruction.trim(),
      trigger_type: triggerType,
      is_active: isActive,
    };

    if (triggerType === "schedule") {
      payload.cadence_type = cadenceType;
      payload.interval_n = cadenceOption?.hasInterval ? intervalN : null;
      payload.days_of_week = cadenceType === "weekly" ? daysOfWeek : [];
      payload.day_of_month = cadenceType === "monthly" ? dayOfMonth : null;
      payload.time_of_day = cadenceOption?.hasTime ? timeOfDay : null;
      payload.timezone = timezone;
      payload.entity_type = null;
      payload.collection_id = null;
      payload.field = null;
      payload.condition = null;
      payload.value = null;
    } else {
      payload.entity_type = entityType;
      payload.collection_id = entityType === "collection_record" ? collectionId : null;
      payload.field = condition !== "created" ? field : null;
      payload.condition = condition;
      payload.value = showValue ? value.trim() : null;
      payload.cadence_type = null;
      payload.interval_n = null;
      payload.days_of_week = [];
      payload.day_of_month = null;
      payload.time_of_day = null;
      payload.timezone = null;
    }

    if (editingRoutine) {
      const { error } = await supabase
        .from("routines")
        .update(payload)
        .eq("id", editingRoutine.id);
      if (error) {
        toast.error("Failed to update routine", { description: error.message });
        setSaving(false);
        return;
      }
      logAudit(supabase, {
        module: "routines",
        entity_type: "routine",
        entity_id: editingRoutine.id,
        action: "updated",
        summary: `Updated routine "${name.trim()}"`,
      });
    } else {
      const { data: inserted, error } = await supabase
        .from("routines")
        .insert(payload)
        .select("id")
        .single();
      if (error || !inserted) {
        toast.error("Failed to create routine", { description: error?.message });
        setSaving(false);
        return;
      }
      logAudit(supabase, {
        module: "routines",
        entity_type: "routine",
        entity_id: inserted.id,
        action: "created",
        summary: `Created routine "${name.trim()}"`,
      });
    }

    setSaving(false);
    onSave();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden max-h-[90dvh] flex flex-col">
        <DialogTitle className="sr-only">
          {editingRoutine ? "Edit routine" : "New routine"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Create or edit a routine for an agent
        </DialogDescription>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex flex-1 flex-col min-h-0"
        >
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Header */}
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-purple-500/10 text-purple-400">
                {triggerType === "schedule" ? (
                  <Clock className="h-3.5 w-3.5" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
              </div>
              <h2 className="text-sm font-medium text-foreground">
                {editingRoutine ? "Edit routine" : "New routine"}
              </h2>
            </div>
          </div>

          <div className="px-5 space-y-4 pb-4">
            {/* Name */}
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Daily inbox check"
                className="mt-1 h-8 text-xs"
              />
            </div>

            {/* Trigger type toggle */}
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                Trigger type
              </label>
              <div className="mt-1 flex gap-1">
                <button
                  type="button"
                  onClick={() => setTriggerType("schedule")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    triggerType === "schedule"
                      ? "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <Clock className="h-3 w-3" />
                  Schedule
                </button>
                <button
                  type="button"
                  onClick={() => setTriggerType("event")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    triggerType === "event"
                      ? "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <Zap className="h-3 w-3" />
                  Event
                </button>
              </div>
            </div>

            {/* Agent picker */}
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                Agent
              </label>
              {lockAgent && selectedAgent ? (
                <div className="mt-1 flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5 text-xs">
                  <span>{selectedAgent.emoji ?? "🤖"}</span>
                  <span className="text-foreground">{selectedAgent.name}</span>
                </div>
              ) : (
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue placeholder="Select agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="flex items-center gap-2">
                          <span>{a.emoji ?? "🤖"}</span>
                          {a.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Schedule config */}
            {triggerType === "schedule" && (
              <div className="space-y-3 rounded-md border border-border/50 p-3">
                {/* Quick presets */}
                {!editingRoutine && (
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                      Quick presets
                    </label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {SUB_DAILY_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => applyPreset(p)}
                          className={cn(
                            "rounded px-2 py-1 text-[11px] transition-colors",
                            cadenceType === p.cadence_type && intervalN === p.interval_n
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cadence type */}
                <div className="flex items-center gap-2">
                  <Select value={cadenceType} onValueChange={(v) => setCadenceType(v as RoutineCadenceType)}>
                    <SelectTrigger className="h-7 flex-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CADENCE_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {cadenceOption?.hasInterval && (
                    <Input
                      type="number"
                      min={cadenceType === "every_n_minutes" ? 5 : 1}
                      value={intervalN}
                      onChange={(e) => setIntervalN(Number(e.target.value) || 1)}
                      className="h-7 w-20 text-xs"
                    />
                  )}
                </div>

                {/* Days of week for weekly */}
                {cadenceType === "weekly" && (
                  <div className="flex gap-1">
                    {DAYS_OF_WEEK_LABELS.map((label, i) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleDay(i + 1)}
                        className={cn(
                          "h-7 w-9 rounded text-[11px] font-medium transition-colors",
                          daysOfWeek.includes(i + 1)
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Day of month for monthly */}
                {cadenceType === "monthly" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Day</span>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(Number(e.target.value) || 1)}
                      className="h-7 w-16 text-xs"
                    />
                  </div>
                )}

                {/* Time of day */}
                {cadenceOption?.hasTime && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">At</span>
                    <Input
                      type="time"
                      value={timeOfDay}
                      onChange={(e) => setTimeOfDay(e.target.value)}
                      className="h-7 w-32 text-xs"
                    />
                    <div className="flex-1">
                      <Input
                        list="tz-list"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        placeholder="Timezone"
                        className="h-7 text-xs"
                      />
                      <datalist id="tz-list">
                        {timezones.map((tz) => (
                          <option key={tz} value={tz} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Event config */}
            {triggerType === "event" && (
              <div className="space-y-3 rounded-md border border-border/50 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>When a</span>
                  <Select value={entityType ?? "contact"} onValueChange={(v) => { setEntityType(v as RoutineEntityType); setField(""); setCollectionId(null); }}>
                    <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ENTITY_TYPE_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {entityType === "collection_record" && (
                    <>
                      <span>in</span>
                      <Select value={collectionId ?? ""} onValueChange={(v) => { setCollectionId(v); setField(""); }}>
                        <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs">
                          <SelectValue placeholder="Pick collection..." />
                        </SelectTrigger>
                        <SelectContent>
                          {collections.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Select value={condition} onValueChange={(v) => setCondition(v as RoutineCondition)}>
                    <SelectTrigger className="h-7 flex-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CONDITION_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {condition !== "created" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Field</span>
                    {entityType === "contact" ? (
                      <Select value={field ?? "status"} onValueChange={setField}>
                        <SelectTrigger className="h-7 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="status">Status</SelectItem>
                          <SelectItem value="tier">Tier</SelectItem>
                          <SelectItem value="primary_channel">Primary Channel</SelectItem>
                          <SelectItem value="best_contact_method">Best Contact Method</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : entityType === "collection_record" && collectionFields.length > 0 ? (
                      <Select value={field ?? ""} onValueChange={setField}>
                        <SelectTrigger className="h-7 flex-1 text-xs">
                          <SelectValue placeholder="Pick field..." />
                        </SelectTrigger>
                        <SelectContent>
                          {collectionFields.map((cf) => (
                            <SelectItem key={cf.field_key} value={cf.field_key}>
                              {cf.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : entityType === "task" ? (
                      <Select value={field ?? ""} onValueChange={setField}>
                        <SelectTrigger className="h-7 flex-1 text-xs">
                          <SelectValue placeholder="Pick field..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="status">Status</SelectItem>
                          <SelectItem value="priority">Priority</SelectItem>
                          <SelectItem value="assigned_agent_id">Assigned Agent</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={field ?? ""}
                        onChange={(e) => setField(e.target.value)}
                        placeholder="field name"
                        className="h-7 flex-1 text-xs"
                      />
                    )}
                  </div>
                )}

                {showValue && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Value</span>
                    {entityType === "contact" && field === "status" ? (
                      <Select value={value} onValueChange={setValue}>
                        <SelectTrigger className="h-7 flex-1 text-xs">
                          <SelectValue placeholder="Pick value..." />
                        </SelectTrigger>
                        <SelectContent>
                          {stageOptions.map((opt) => {
                            const stage = stagesByKey[opt.value];
                            return (
                              <SelectItem key={opt.value} value={opt.value}>
                                <span className="flex items-center gap-2">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: stage?.color ?? "#64748b" }}
                                  />
                                  {opt.label}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="Enter value..."
                        className="h-7 flex-1 text-xs"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Instruction */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                  Instruction
                </label>
                {triggerType === "event" && (
                  <div className="flex items-center gap-1">
                    {TEMPLATE_VARS.map((v) => (
                      <button
                        key={v.token}
                        type="button"
                        title={v.hint}
                        onClick={() => insertToken(v.token)}
                        className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {v.token}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <textarea
                ref={instructionRef}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={
                  triggerType === "schedule"
                    ? "e.g. Check inbox and process pending tasks"
                    : "e.g. Research {name} and update their profile"
                }
                rows={3}
                className="mt-1 w-full rounded-md border border-border/50 bg-transparent px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 px-5 py-3 shrink-0">
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch
              data-size="sm"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <span className="text-xs text-muted-foreground">
              {isActive ? "Active" : "Paused"}
            </span>
          </label>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-7 text-xs"
              disabled={saving || !canSubmit}
            >
              {saving ? "Saving..." : editingRoutine ? "Save changes" : "Create routine"}
            </Button>
          </div>
        </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
