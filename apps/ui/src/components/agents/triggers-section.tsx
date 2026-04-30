"use client";

// "What wakes this agent?" — the one-stop view of every trigger that
// targets this specific agent. Lives inside the Overview tab between
// Context Documents and Inbox so an operator can scan top-to-bottom:
//
//   identity → context loaded → what wakes it → what's pending
//
// Three sub-sections:
//
//   Scheduled (recurring tasks)  — task_series rows, pause/resume/delete
//   Event-driven (automations)   — automation_rules rows, toggle/delete/edit
//   Direct (always on)           — static list of channels (task assigns,
//                                  comment @-mentions, Telegram)
//
// What this section does NOT show:
//   - Inbox items (those live in InboxSection — causes vs effects).
//   - Audit log (wrong abstraction level).
//   - Outbound work the agent created (that's "what the agent does",
//     not "what wakes it").

import { useState } from "react";
import Link from "next/link";
import {
  AtSign,
  CheckSquare,
  ExternalLink,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Send,
  Trash2,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Agent, AgentChannel, AgentMeta } from "@/lib/agents/types";
import type { TaskSeries } from "@/lib/tasks/types";
import type { AutomationRule } from "@/lib/automations/types";
import { longCadenceLabel } from "@/lib/tasks/cadence";
import { humanizeAutomationRule } from "@/lib/automations/humanize";
import { useAgentTaskSeries } from "@/hooks/use-agent-task-series";
import { useAgentAutomationRules } from "@/hooks/use-agent-automation-rules";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { AutomationRuleForm } from "@/components/automations/automation-rule-form";
import { SeriesForm } from "@/components/tasks/series-form";
import { cn } from "@/lib/utils";

interface TriggersSectionProps {
  agent: Agent;
}

export function TriggersSection({ agent }: TriggersSectionProps) {
  const series = useAgentTaskSeries(agent.id);
  const rules = useAgentAutomationRules(agent.id);

  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [creatingRule, setCreatingRule] = useState(false);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [confirmDeleteSeries, setConfirmDeleteSeries] = useState<TaskSeries | null>(
    null,
  );
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<AutomationRule | null>(
    null,
  );

  const editingRule = editingRuleId
    ? rules.rules.find((r) => r.id === editingRuleId) ?? null
    : null;

  const activeSeriesCount = series.seriesList.filter((s) => !s.is_paused).length;
  const activeRuleCount = rules.rules.filter((r) => r.is_active).length;

  return (
    <div>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Triggers
      </h2>
      <p className="mb-4 text-[12px] text-muted-foreground/80">
        What makes this agent do something. Triggers are like alarms —
        they wake the agent up so it can read its inbox and act. Add,
        pause, or remove them here.
      </p>

      <div className="space-y-4">
        {/* ── Scheduled ─────────────────────────────────────────── */}
        <SubSection
          icon={Repeat}
          title="Scheduled"
          countLabel={
            series.seriesList.length === 0
              ? null
              : `${activeSeriesCount} active${
                  series.seriesList.length !== activeSeriesCount
                    ? ` · ${series.seriesList.length - activeSeriesCount} paused`
                    : ""
                }`
          }
          description="Wake on a schedule — every weekday at 9am, every Monday, every hour, etc."
          action={
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px]"
              title="Create a recurring task assigned to this agent"
            >
              <Link
                href={`/dashboard/tasks?view=recurring&new=1&assignee=${agent.id}`}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Link>
            </Button>
          }
        >
          {series.loading ? (
            <LoadingSkeleton variant="list" count={2} />
          ) : series.seriesList.length === 0 ? (
            <EmptyHint
              text="Nothing scheduled. Add a recurring task and the agent will be woken on its cadence (e.g. every weekday morning)."
              ctaText="Create a recurring task"
              ctaHref={`/dashboard/tasks?view=recurring&new=1&assignee=${agent.id}`}
            />
          ) : (
            <div className="overflow-hidden rounded-md border border-border/60 bg-card">
              {series.seriesList.map((s, idx) => (
                <ScheduledRow
                  key={s.id}
                  series={s}
                  isFirst={idx === 0}
                  onOpen={() => setEditingSeriesId(s.id)}
                  onPause={() => series.actions.pauseSeries(s.id)}
                  onResume={() => series.actions.resumeSeries(s.id)}
                  onDelete={() => setConfirmDeleteSeries(s)}
                />
              ))}
            </div>
          )}
        </SubSection>

        {/* ── Event-driven ──────────────────────────────────────── */}
        <SubSection
          icon={Zap}
          title="Event-driven"
          countLabel={
            rules.rules.length === 0
              ? null
              : `${activeRuleCount} active${
                  rules.rules.length !== activeRuleCount
                    ? ` · ${rules.rules.length - activeRuleCount} paused`
                    : ""
                }`
          }
          description="Wake when something changes — e.g. a new contact is added, or a contact moves to a new pipeline stage."
          action={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px]"
              onClick={() => setCreatingRule(true)}
              title="Create an automation rule targeting this agent"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          }
        >
          {rules.loading ? (
            <LoadingSkeleton variant="list" count={2} />
          ) : rules.rules.length === 0 ? (
            <EmptyHint
              text="No automations yet. Add one and this agent will wake whenever the change you pick happens (e.g. when a contact moves to Qualified)."
              ctaText="Create an automation rule"
              ctaOnClick={() => setCreatingRule(true)}
            />
          ) : (
            <div className="overflow-hidden rounded-md border border-border/60 bg-card">
              {rules.rules.map((r, idx) => (
                <EventRow
                  key={r.id}
                  rule={r}
                  isFirst={idx === 0}
                  onEdit={() => setEditingRuleId(r.id)}
                  onToggle={() => rules.actions.toggleActive(r.id, r.is_active)}
                  onDelete={() => setConfirmDeleteRule(r)}
                />
              ))}
            </div>
          )}
        </SubSection>

        {/* ── Direct ────────────────────────────────────────────── */}
        <SubSection
          icon={Send}
          title="Direct"
          countLabel="always on"
          description="Built-in ways to wake this agent — can't be turned off (they're how the agent stays useful)."
        >
          <DirectChannelsList agent={agent} />
        </SubSection>
      </div>

      {/* ── Forms (modals) ────────────────────────────────────── */}
      {creatingRule && (
        <AutomationRuleForm
          editingRule={null}
          initialValues={{ targetAgentId: agent.id, lockTargetAgent: true }}
          onSave={() => {
            setCreatingRule(false);
            void rules.actions.refetch();
          }}
          onCancel={() => setCreatingRule(false)}
        />
      )}
      {editingRule && (
        <AutomationRuleForm
          editingRule={editingRule}
          onSave={() => {
            setEditingRuleId(null);
            void rules.actions.refetch();
          }}
          onCancel={() => setEditingRuleId(null)}
        />
      )}
      {editingSeriesId && (
        <SeriesForm
          seriesId={editingSeriesId}
          onClose={() => {
            setEditingSeriesId(null);
            void series.actions.refetch();
          }}
        />
      )}

      {/* ── Confirms ──────────────────────────────────────────── */}
      {confirmDeleteSeries && (
        <ConfirmDialog
          open
          tone="destructive"
          title={`Delete "${confirmDeleteSeries.title}"?`}
          description="The series will stop spawning new occurrences. Past task instances stay in history."
          confirmLabel="Delete"
          onCancel={() => setConfirmDeleteSeries(null)}
          onConfirm={async () => {
            await series.actions.deleteSeries(confirmDeleteSeries.id);
            setConfirmDeleteSeries(null);
          }}
        />
      )}
      {confirmDeleteRule && (
        <ConfirmDialog
          open
          tone="destructive"
          title="Delete this automation?"
          description={
            <>
              {humanizeAutomationRule(confirmDeleteRule)} — this rule will
              stop firing. Inbox items it has already produced are kept.
            </>
          }
          confirmLabel="Delete"
          onCancel={() => setConfirmDeleteRule(null)}
          onConfirm={async () => {
            await rules.actions.deleteRule(confirmDeleteRule.id);
            setConfirmDeleteRule(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-section shell ───────────────────────────────────────────────

function SubSection({
  icon: Icon,
  title,
  countLabel,
  description,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  countLabel: string | null;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <Icon className="h-3.5 w-3.5 self-center text-muted-foreground" />
          <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
          {countLabel && (
            <span className="text-[11px] text-muted-foreground/70">
              {countLabel}
            </span>
          )}
        </div>
        {action}
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground/60">{description}</p>
      {children}
    </div>
  );
}

// ─── Empty hint with CTA ─────────────────────────────────────────────

function EmptyHint({
  text,
  ctaText,
  ctaOnClick,
  ctaHref,
}: {
  text: string;
  ctaText: string;
  ctaOnClick?: () => void;
  ctaHref?: string;
}) {
  const cta = ctaHref ? (
    <Link
      href={ctaHref}
      className="text-[12px] font-medium text-foreground hover:underline"
    >
      {ctaText} →
    </Link>
  ) : (
    <button
      type="button"
      onClick={ctaOnClick}
      className="text-[12px] font-medium text-foreground hover:underline"
    >
      {ctaText} →
    </button>
  );

  return (
    <div className="rounded-md border border-dashed border-border/60 bg-card/40 px-3 py-3 text-[12px] text-muted-foreground">
      <p className="mb-1">{text}</p>
      {cta}
    </div>
  );
}

// ─── Scheduled row ───────────────────────────────────────────────────

function ScheduledRow({
  series,
  isFirst,
  onOpen,
  onPause,
  onResume,
  onDelete,
}: {
  series: TaskSeries;
  isFirst: boolean;
  onOpen: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
}) {
  const next = series.next_occurrence_at;
  const nextLabel =
    series.is_paused
      ? null
      : next
        ? formatDistanceToNow(new Date(next), { addSuffix: true })
        : "—";

  return (
    <div
      className={cn(
        "group relative flex h-12 items-center gap-3 px-3 transition-colors hover:bg-muted/20",
        !isFirst && "border-t border-border/50",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0"
        aria-label={`Edit ${series.title}`}
      />

      {/* Status dot */}
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          series.is_paused
            ? "bg-muted-foreground/40"
            : "animate-pulse bg-emerald-500",
        )}
      />

      {/* Title */}
      <span className="max-w-[260px] shrink-0 truncate text-[13px] font-medium text-foreground">
        {series.title}
      </span>

      {/* Cadence + next */}
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {longCadenceLabel(series)}
        {nextLabel && (
          <>
            <span className="mx-1 text-muted-foreground/40">·</span>
            <span>next {nextLabel}</span>
          </>
        )}
        {series.is_paused && (
          <>
            <span className="mx-1 text-muted-foreground/40">·</span>
            <span className="text-amber-300">Paused</span>
          </>
        )}
      </span>

      {/* Stream chip */}
      {series.stream && (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
          style={{
            backgroundColor: `${series.stream.color}1a`,
            color: series.stream.color,
          }}
        >
          {series.stream.name}
        </span>
      )}

      {/* Actions */}
      <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Series actions"
              onClick={(e) => e.preventDefault()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              className="gap-2"
              onSelect={(e) => {
                e.preventDefault();
                onOpen();
              }}
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              Edit
            </DropdownMenuItem>
            {series.is_paused ? (
              <DropdownMenuItem
                className="gap-2"
                onSelect={(e) => {
                  e.preventDefault();
                  onResume();
                }}
              >
                <Play className="h-3.5 w-3.5 text-muted-foreground" />
                Resume
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="gap-2"
                onSelect={(e) => {
                  e.preventDefault();
                  onPause();
                }}
              >
                <Pause className="h-3.5 w-3.5 text-muted-foreground" />
                Pause
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="gap-2" asChild>
              <Link href={`/dashboard/tasks?view=recurring&series=${series.id}`}>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                Open in Tasks
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Event row (automation rule) ─────────────────────────────────────

function EventRow({
  rule,
  isFirst,
  onEdit,
  onToggle,
  onDelete,
}: {
  rule: AutomationRule;
  isFirst: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex h-12 items-center gap-3 px-3 transition-colors hover:bg-muted/20",
        !isFirst && "border-t border-border/50",
      )}
    >
      <Switch
        checked={rule.is_active}
        onCheckedChange={onToggle}
        aria-label={rule.is_active ? "Pause rule" : "Activate rule"}
        className="z-10 shrink-0"
      />

      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "max-w-[420px] truncate text-[13px]",
              rule.is_active
                ? "text-foreground"
                : "text-muted-foreground/70",
            )}
          >
            {humanizeAutomationRule(rule)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-mono">{rule.event_type}</span>
        </div>
      </button>

      {/* Actions */}
      <div className="z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Rule actions">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              className="gap-2"
              onSelect={(e) => {
                e.preventDefault();
                onEdit();
              }}
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" asChild>
              <Link href="/dashboard/automations">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                Open in Automations
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault();
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Direct channels (always-on) ─────────────────────────────────────

const CHANNEL_ROW: Record<Exclude<AgentChannel, "none">, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail: string;
}> = {
  telegram: {
    icon: Send,
    label: "Telegram",
    detail: "Wakes up on Telegram DMs or @-mentions.",
  },
  discord: {
    icon: MessageSquare,
    label: "Discord",
    detail: "Wakes up on Discord DMs or server messages.",
  },
  slack: {
    icon: MessageSquare,
    label: "Slack",
    detail: "Wakes up on Slack DMs or channel messages.",
  },
};

function DirectChannelsList({ agent }: { agent: Agent }) {
  const meta = (agent.meta ?? {}) as AgentMeta;
  const agentChannel = meta.channel ?? "telegram";

  const channels: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    detail: string;
  }[] = [
    {
      icon: CheckSquare,
      label: "Task assignments",
      detail: "Wakes up whenever you assign a task to this agent.",
    },
    {
      icon: AtSign,
      label: "Comment @-mentions",
      detail: "Wakes up when you @-mention them in a task comment.",
    },
  ];

  if (agentChannel !== "none") {
    const row = CHANNEL_ROW[agentChannel];
    channels.push({ icon: row.icon, label: row.label, detail: row.detail });
  }

  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-card/40">
      {channels.map((c, idx) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className={cn(
              "flex items-start gap-3 px-3 py-2.5 text-[12px]",
              idx > 0 && "border-t border-border/50",
            )}
          >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">{c.label}</div>
              <div className="text-[11px] text-muted-foreground">
                {c.detail}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

