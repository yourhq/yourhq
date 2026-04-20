"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AutomationRule, RuleCondition } from "@/lib/automations/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { logAudit } from "@/lib/audit/log";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bot, ChevronDown, Sparkles, Zap, Inbox, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutomationRuleFormProps {
  editingRule: AutomationRule | null;
  onSave: () => void;
  onCancel: () => void;
}

interface AgentOption {
  id: string;
  slug: string;
  name: string;
  emoji?: string;
}

const TRIGGER_OPTIONS: {
  id: string;
  label: string;
  description: string;
  condition: RuleCondition;
  field: string | null;
  requiresValue: boolean;
  valueSource?: "pipeline_stages" | "free_text";
}[] = [
  {
    id: "created",
    label: "is created",
    description: "Fires when a new contact is added",
    condition: "created",
    field: null,
    requiresValue: false,
  },
  {
    id: "status_changed_to",
    label: "status changes to…",
    description: "Fires when a contact moves to a specific stage",
    condition: "changed_to",
    field: "status",
    requiresValue: true,
    valueSource: "pipeline_stages",
  },
  {
    id: "status_any_change",
    label: "status changes (any)",
    description: "Fires on any status transition",
    condition: "any_change",
    field: "status",
    requiresValue: false,
  },
  {
    id: "tier_changed_to",
    label: "tier changes to…",
    description: "Fires when contact tier is updated",
    condition: "changed_to",
    field: "tier",
    requiresValue: true,
    valueSource: "free_text",
  },
  {
    id: "primary_channel_changed_to",
    label: "primary channel changes to…",
    description: "Fires when preferred channel updates",
    condition: "changed_to",
    field: "primary_channel",
    requiresValue: true,
    valueSource: "free_text",
  },
  {
    id: "best_contact_method_changed_to",
    label: "best contact method changes to…",
    description: "Fires when best contact method updates",
    condition: "changed_to",
    field: "best_contact_method",
    requiresValue: true,
    valueSource: "free_text",
  },
];

interface StarterTemplate {
  id: string;
  label: string;
  description: string;
  triggerId: string;
  value?: string;
  summary: string;
}

const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "new-lead",
    label: "New lead triage",
    description: "When a new contact appears, notify an agent to research them",
    triggerId: "created",
    summary: "New contact {name} — triage and enrich",
  },
  {
    id: "hot-lead",
    label: "Hot lead alert",
    description: "When status moves to qualified, ping an agent to follow up",
    triggerId: "status_changed_to",
    value: "qualified",
    summary: "{name} is now qualified — ready for outreach",
  },
  {
    id: "status-watcher",
    label: "Status change watcher",
    description: "Track every status transition on your pipeline",
    triggerId: "status_any_change",
    summary: "{name}: {old_value} → {new_value}",
  },
];

const TEMPLATE_VARS = [
  { token: "{name}", hint: "Contact name" },
  { token: "{old_value}", hint: "Previous value" },
  { token: "{new_value}", hint: "New value" },
];

function computeEventType(condition: RuleCondition, field: string | null): string {
  if (condition === "created") return "contact_created";
  if (field === "status") return "contact_status_changed";
  return "contact_updated";
}

function findTriggerByRule(rule: AutomationRule): string {
  for (const t of TRIGGER_OPTIONS) {
    if (t.condition === rule.condition && t.field === rule.field) return t.id;
  }
  return "created";
}

function renderSummaryPreview(template: string, sampleValue: string): string {
  if (!template) return "";
  return template
    .replaceAll("{name}", "Alex Chen")
    .replaceAll("{old_value}", "identified")
    .replaceAll("{new_value}", sampleValue || "qualified");
}

export function AutomationRuleForm({ editingRule, onSave, onCancel }: AutomationRuleFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [saving, setSaving] = useState(false);
  const { stageOptions, stagesByKey } = usePipelineStages("contact");

  const [triggerId, setTriggerId] = useState<string>(
    editingRule ? findTriggerByRule(editingRule) : "created",
  );
  const [value, setValue] = useState(editingRule?.value ?? "");
  const [targetAgentId, setTargetAgentId] = useState(editingRule?.target_agent_id ?? "");
  const [summaryTemplate, setSummaryTemplate] = useState(editingRule?.summary_template ?? "");
  const [isActive, setIsActive] = useState(editingRule?.is_active ?? true);

  const [triggerOpen, setTriggerOpen] = useState(false);
  const [valueOpen, setValueOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const summaryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("agents")
        .select("id, slug, name, meta")
        .order("name", { ascending: true });
      if (cancelled || !data) return;
      setAgents(
        data.map((a: { id: string; slug: string; name: string; meta: Record<string, unknown> | null }) => ({
          id: a.id,
          slug: a.slug,
          name: a.name,
          emoji: (a.meta as { emoji?: string } | null)?.emoji,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const trigger = TRIGGER_OPTIONS.find((t) => t.id === triggerId) ?? TRIGGER_OPTIONS[0];
  const selectedAgent = agents.find((a) => a.id === targetAgentId) ?? null;

  const showValue = trigger.requiresValue;
  const valueLabel = useMemo(() => {
    if (!showValue || !value) return null;
    if (trigger.valueSource === "pipeline_stages") {
      return stagesByKey[value]?.label ?? value;
    }
    return value;
  }, [showValue, value, trigger.valueSource, stagesByKey]);

  const canSubmit =
    !!targetAgentId && (!showValue || value.trim().length > 0);

  function applyTemplate(tpl: StarterTemplate) {
    setTriggerId(tpl.triggerId);
    setValue(tpl.value ?? "");
    setSummaryTemplate(tpl.summary);
  }

  function insertToken(token: string) {
    const input = summaryRef.current;
    if (!input) {
      setSummaryTemplate((s) => s + token);
      return;
    }
    const start = input.selectionStart ?? summaryTemplate.length;
    const end = input.selectionEnd ?? summaryTemplate.length;
    const next = summaryTemplate.slice(0, start) + token + summaryTemplate.slice(end);
    setSummaryTemplate(next);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + token.length;
      input.setSelectionRange(pos, pos);
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);

    const agent = agents.find((a) => a.id === targetAgentId);
    const payload = {
      table_name: "contacts",
      field: trigger.field,
      condition: trigger.condition,
      value: showValue ? value.trim() : null,
      target_agent_id: targetAgentId,
      target_agent_slug: agent?.slug ?? "",
      event_type: computeEventType(trigger.condition, trigger.field),
      summary_template: summaryTemplate.trim() || null,
      is_active: isActive,
    };

    const summaryLine = `${trigger.label}${valueLabel ? ` "${valueLabel}"` : ""} → ${agent?.name ?? "agent"}`;

    if (editingRule) {
      await supabase.from("automation_rules").update(payload).eq("id", editingRule.id);
      logAudit(supabase, {
        module: "automations",
        entity_type: "automation_rule",
        entity_id: editingRule.id,
        action: "updated",
        summary: `Updated automation: ${summaryLine}`,
      });
    } else {
      const { data: inserted } = await supabase
        .from("automation_rules")
        .insert(payload)
        .select("id")
        .single();
      if (inserted) {
        logAudit(supabase, {
          module: "automations",
          entity_type: "automation_rule",
          entity_id: inserted.id,
          action: "created",
          summary: `Created automation: ${summaryLine}`,
        });
      }
    }

    setSaving(false);
    onSave();
  }

  const summaryPreview = renderSummaryPreview(
    summaryTemplate || "{name} moved to {new_value}",
    valueLabel ?? "",
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden max-h-[90dvh] flex flex-col">
        <DialogTitle className="sr-only">
          {editingRule ? "Edit automation" : "New automation"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Notify an agent when a contact changes. Build the rule by clicking each pill.
        </DialogDescription>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Header */}
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-amber-500/10 text-amber-400">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <h2 className="text-sm font-medium text-foreground">
                {editingRule ? "Edit automation" : "New automation"}
              </h2>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Automations wake an agent up whenever something changes in your workspace. Compose your rule below.
            </p>
          </div>

          {/* Starter templates — hidden when editing */}
          {!editingRule && (
            <div className="px-5 pb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Start from a template
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {STARTER_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="group rounded-md border border-border/50 bg-muted/10 px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-muted/30"
                  >
                    <div className="text-xs font-medium text-foreground">{tpl.label}</div>
                    <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground line-clamp-2">
                      {tpl.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sentence builder hero */}
          <div className="mx-5 my-3 rounded-lg border border-border/60 bg-muted/10 px-4 py-4">
            <div className="flex flex-wrap items-center gap-1.5 text-sm leading-relaxed">
              <span className="text-muted-foreground">When a</span>
              <Pill tone="neutral">contact</Pill>

              {/* Trigger pill */}
              <Popover open={triggerOpen} onOpenChange={setTriggerOpen}>
                <PopoverTrigger asChild>
                  <button type="button">
                    <Pill tone="primary" active={triggerOpen}>
                      {trigger.label}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </Pill>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  portal={false}
                  align="start"
                  className="w-72 p-1"
                >
                  <div className="max-h-72 overflow-y-auto">
                    {TRIGGER_OPTIONS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setTriggerId(t.id);
                          setValue("");
                          setTriggerOpen(false);
                        }}
                        className={cn(
                          "w-full rounded px-2 py-1.5 text-left transition-colors hover:bg-muted",
                          t.id === triggerId && "bg-muted",
                        )}
                      >
                        <div className="text-xs font-medium text-foreground">{t.label}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {t.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Value pill — only when required */}
              {showValue && (
                <Popover open={valueOpen} onOpenChange={setValueOpen}>
                  <PopoverTrigger asChild>
                    <button type="button">
                      <Pill tone={value ? "accent" : "empty"} active={valueOpen}>
                        {valueLabel ?? "pick value"}
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </Pill>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent portal={false} align="start" className="w-64 p-1">
                    {trigger.valueSource === "pipeline_stages" ? (
                      <div className="max-h-72 overflow-y-auto">
                        {stageOptions.length === 0 ? (
                          <div className="px-2 py-3 text-[11px] text-muted-foreground">
                            No pipeline stages defined yet
                          </div>
                        ) : (
                          stageOptions.map((opt) => {
                            const stage = stagesByKey[opt.value];
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  setValue(opt.value);
                                  setValueOpen(false);
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
                                  value === opt.value && "bg-muted",
                                )}
                              >
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: stage?.color ?? "#64748b" }}
                                />
                                <span className="text-foreground">{opt.label}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      <div className="p-1.5">
                        <Input
                          autoFocus
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setValueOpen(false);
                          }}
                          placeholder="Enter value..."
                          className="h-7 text-xs"
                        />
                        <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
                          Press Enter to confirm
                        </p>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}

              <span className="text-muted-foreground">notify</span>

              {/* Agent pill */}
              <Popover open={agentOpen} onOpenChange={setAgentOpen}>
                <PopoverTrigger asChild>
                  <button type="button">
                    <Pill tone={selectedAgent ? "accent" : "empty"} active={agentOpen}>
                      {selectedAgent ? (
                        <>
                          <span className="text-xs leading-none">
                            {selectedAgent.emoji ?? "🤖"}
                          </span>
                          <span>{selectedAgent.name}</span>
                        </>
                      ) : (
                        <>
                          <Bot className="h-3 w-3 opacity-60" />
                          <span>pick agent</span>
                        </>
                      )}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </Pill>
                  </button>
                </PopoverTrigger>
                <PopoverContent portal={false} align="start" className="w-64 p-1">
                  <div className="max-h-72 overflow-y-auto">
                    {agents.length === 0 ? (
                      <div className="px-2 py-3 text-[11px] text-muted-foreground">
                        No agents yet — create one first
                      </div>
                    ) : (
                      agents.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setTargetAgentId(a.id);
                            setAgentOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
                            a.id === targetAgentId && "bg-muted",
                          )}
                        >
                          <span className="text-sm leading-none">{a.emoji ?? "🤖"}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-foreground">{a.name}</div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {a.slug}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground">
              The agent will receive a durable inbox item — it can act on it autonomously, even while offline.
            </p>
          </div>

          {/* Message composer */}
          <div className="px-5 py-3 border-t border-border/40">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                Message sent to agent
              </label>
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
            </div>
            <Input
              ref={summaryRef}
              value={summaryTemplate}
              onChange={(e) => setSummaryTemplate(e.target.value)}
              placeholder="e.g. New lead {name} — research and qualify"
              className="h-8 text-xs"
            />

            {/* Live inbox preview */}
            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Inbox className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Preview — how it lands in {selectedAgent?.name ?? "the agent"}&apos;s inbox
                </span>
              </div>
              <div className="rounded-md border border-border/40 bg-background/50 px-3 py-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted/40 text-xs">
                    {selectedAgent?.emoji ?? "🤖"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="font-mono">
                        {computeEventType(trigger.condition, trigger.field)}
                      </span>
                      <ArrowRight className="h-2.5 w-2.5" />
                      <span>pending</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-foreground">
                      {summaryPreview || (
                        <span className="text-muted-foreground/60 italic">
                          Your message will appear here
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
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
              {isActive ? "Active — will fire on changes" : "Paused"}
            </span>
          </label>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSubmit}
              disabled={saving || !canSubmit}
            >
              {saving ? "Saving..." : editingRule ? "Save changes" : "Create automation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Pill({
  children,
  tone,
  active,
}: {
  children: React.ReactNode;
  tone: "neutral" | "primary" | "accent" | "empty";
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors",
        tone === "neutral" && "bg-muted/50 text-foreground",
        tone === "primary" &&
          "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20 hover:bg-amber-500/20",
        tone === "accent" &&
          "bg-blue-500/10 text-blue-300 ring-1 ring-blue-500/20 hover:bg-blue-500/20",
        tone === "empty" &&
          "bg-transparent text-muted-foreground ring-1 ring-dashed ring-border hover:text-foreground hover:ring-border/80",
        active && "ring-2 ring-offset-0",
      )}
    >
      {children}
    </span>
  );
}
