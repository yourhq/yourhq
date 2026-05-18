"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AtSign,
  CheckSquare,
  Clock,
  ExternalLink,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Agent, AgentChannel, AgentMeta } from "@/lib/agents/types";
import type { Routine } from "@/lib/routines/types";
import { humanizeRoutine } from "@/lib/routines/humanize";
import { useAgentRoutines } from "@/hooks/use-agent-routines";
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
import { RoutineForm } from "@/components/routines/routine-form";
import { cn } from "@/lib/utils";

interface RoutinesSectionProps {
  agent: Agent;
  onAgentUpdated?: () => void;
}

export function RoutinesSection({ agent }: RoutinesSectionProps) {
  const { routines, loading, actions } = useAgentRoutines(agent.id);

  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [creatingRoutine, setCreatingRoutine] = useState<"schedule" | "event" | null>(null);
  const [confirmDeleteRoutine, setConfirmDeleteRoutine] = useState<Routine | null>(null);

  const editingRoutine = editingRoutineId
    ? routines.find((r) => r.id === editingRoutineId) ?? null
    : null;

  const scheduleRoutines = routines.filter((r) => r.trigger_type === "schedule");
  const eventRoutines = routines.filter((r) => r.trigger_type === "event");
  const activeScheduleCount = scheduleRoutines.filter((r) => r.is_active).length;
  const activeEventCount = eventRoutines.filter((r) => r.is_active).length;

  return (
    <div>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Zap className="mr-1.5 inline h-3 w-3" />
        Routines
      </h2>
      <p className="mb-4 text-[12px] text-muted-foreground/80">
        Ongoing agent behaviors — scheduled checks and event reactions.
      </p>

      <div className="space-y-4">
        {/* Schedule routines */}
        <SubSection
          icon={Clock}
          title="Scheduled"
          countLabel={
            scheduleRoutines.length === 0
              ? null
              : `${activeScheduleCount} active${
                  scheduleRoutines.length !== activeScheduleCount
                    ? ` · ${scheduleRoutines.length - activeScheduleCount} paused`
                    : ""
                }`
          }
          description="Run on a schedule — every N minutes, daily, weekly, etc."
          action={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px]"
              onClick={() => setCreatingRoutine("schedule")}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          }
        >
          {loading ? (
            <LoadingSkeleton variant="list" count={2} />
          ) : scheduleRoutines.length === 0 ? (
            <EmptyHint
              text="No scheduled routines. Add one to wake this agent on a recurring cadence."
              ctaText="Create a schedule routine"
              ctaOnClick={() => setCreatingRoutine("schedule")}
            />
          ) : (
            <div className="overflow-hidden rounded-md border border-border/60 bg-card">
              {scheduleRoutines.map((r, idx) => (
                <RoutineRow
                  key={r.id}
                  routine={r}
                  isFirst={idx === 0}
                  onEdit={() => setEditingRoutineId(r.id)}
                  onToggle={() => actions.toggleActive(r.id, r.is_active)}
                  onDelete={() => setConfirmDeleteRoutine(r)}
                  onRunNow={() => actions.runNow(r.id)}
                />
              ))}
            </div>
          )}
        </SubSection>

        {/* Event routines */}
        <SubSection
          icon={Zap}
          title="Event-driven"
          countLabel={
            eventRoutines.length === 0
              ? null
              : `${activeEventCount} active${
                  eventRoutines.length !== activeEventCount
                    ? ` · ${eventRoutines.length - activeEventCount} paused`
                    : ""
                }`
          }
          description="React when something changes — a contact is created, a field updates, etc."
          action={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px]"
              onClick={() => setCreatingRoutine("event")}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          }
        >
          {loading ? (
            <LoadingSkeleton variant="list" count={2} />
          ) : eventRoutines.length === 0 ? (
            <EmptyHint
              text="No event routines. Add one to wake this agent when data changes."
              ctaText="Create an event routine"
              ctaOnClick={() => setCreatingRoutine("event")}
            />
          ) : (
            <div className="overflow-hidden rounded-md border border-border/60 bg-card">
              {eventRoutines.map((r, idx) => (
                <RoutineRow
                  key={r.id}
                  routine={r}
                  isFirst={idx === 0}
                  onEdit={() => setEditingRoutineId(r.id)}
                  onToggle={() => actions.toggleActive(r.id, r.is_active)}
                  onDelete={() => setConfirmDeleteRoutine(r)}
                  onRunNow={() => actions.runNow(r.id)}
                />
              ))}
            </div>
          )}
        </SubSection>

        {/* Direct channels */}
        <SubSection
          icon={Send}
          title="Direct"
          countLabel="always on"
          description="Built-in ways to wake this agent."
        >
          <DirectChannelsList agent={agent} />
        </SubSection>
      </div>

      {/* Forms */}
      {creatingRoutine && (
        <RoutineForm
          editingRoutine={null}
          initialValues={{
            agentId: agent.id,
            lockAgent: true,
            triggerType: creatingRoutine,
          }}
          onSave={() => {
            setCreatingRoutine(null);
            void actions.refetch();
          }}
          onCancel={() => setCreatingRoutine(null)}
        />
      )}
      {editingRoutine && (
        <RoutineForm
          editingRoutine={editingRoutine}
          onSave={() => {
            setEditingRoutineId(null);
            void actions.refetch();
          }}
          onCancel={() => setEditingRoutineId(null)}
          onRunNow={actions.runNow}
        />
      )}

      {/* Confirm delete */}
      {confirmDeleteRoutine && (
        <ConfirmDialog
          open
          tone="destructive"
          title={`Delete "${confirmDeleteRoutine.name}"?`}
          description="This routine will stop firing. Inbox items it has already produced are kept."
          confirmLabel="Delete"
          onCancel={() => setConfirmDeleteRoutine(null)}
          onConfirm={async () => {
            await actions.deleteRoutine(confirmDeleteRoutine.id);
            setConfirmDeleteRoutine(null);
          }}
        />
      )}
    </div>
  );
}

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
            <span className="text-[11px] text-muted-foreground/70">{countLabel}</span>
          )}
        </div>
        {action}
      </div>
      <p className="mb-2 text-[11px] text-muted-foreground/60">{description}</p>
      {children}
    </div>
  );
}

function EmptyHint({
  text,
  ctaText,
  ctaOnClick,
}: {
  text: string;
  ctaText: string;
  ctaOnClick: () => void;
}) {
  return (
    <div className="rounded-md border border-dashed border-border/60 bg-card/40 px-3 py-3 text-[12px] text-muted-foreground">
      <p className="mb-1">{text}</p>
      <button
        type="button"
        onClick={ctaOnClick}
        className="text-[12px] font-medium text-foreground hover:underline"
      >
        {ctaText} →
      </button>
    </div>
  );
}

function RoutineRow({
  routine,
  isFirst,
  onEdit,
  onToggle,
  onDelete,
  onRunNow,
}: {
  routine: Routine;
  isFirst: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onRunNow: () => void;
}) {
  const nextLabel =
    routine.trigger_type === "schedule" && routine.is_active && routine.next_run_at
      ? formatDistanceToNow(new Date(routine.next_run_at), { addSuffix: true })
      : null;

  return (
    <div
      className={cn(
        "group relative flex h-12 items-center gap-3 px-3 transition-colors hover:bg-muted/20",
        !isFirst && "border-t border-border/50"
      )}
    >
      <Switch
        checked={routine.is_active}
        onCheckedChange={onToggle}
        aria-label={routine.is_active ? "Pause routine" : "Activate routine"}
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
              routine.is_active ? "text-foreground" : "text-muted-foreground/70"
            )}
          >
            {routine.name}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{humanizeRoutine(routine)}</span>
          {nextLabel && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>next {nextLabel}</span>
            </>
          )}
          {routine.run_count > 0 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>{routine.run_count} runs</span>
            </>
          )}
        </div>
      </button>

      <div className="z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Routine actions">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem className="gap-2" onSelect={(e) => { e.preventDefault(); onEdit(); }}>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={(e) => { e.preventDefault(); onRunNow(); }}>
              <Play className="h-3.5 w-3.5 text-muted-foreground" />
              Run now
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" asChild>
              <Link href="/dashboard/routines">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                Open in Routines
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              onSelect={(e) => { e.preventDefault(); onDelete(); }}
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

const CHANNEL_ROW: Record<
  Exclude<AgentChannel, "none">,
  { icon: React.ComponentType<{ className?: string }>; label: string; detail: string }
> = {
  telegram: { icon: Send, label: "Telegram", detail: "Wakes up on Telegram DMs or @-mentions." },
  discord: { icon: MessageSquare, label: "Discord", detail: "Wakes up on Discord DMs or server messages." },
  slack: { icon: MessageSquare, label: "Slack", detail: "Wakes up on Slack DMs or channel messages." },
};

function DirectChannelsList({ agent }: { agent: Agent }) {
  const meta = (agent.meta ?? {}) as AgentMeta;
  const agentChannel = meta.channel ?? "telegram";

  const channels: { icon: React.ComponentType<{ className?: string }>; label: string; detail: string }[] = [
    { icon: CheckSquare, label: "Task assignments", detail: "Wakes up whenever you assign a task to this agent." },
    { icon: AtSign, label: "Comment @-mentions", detail: "Wakes up when you @-mention them in a task comment." },
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
              idx > 0 && "border-t border-border/50"
            )}
          >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">{c.label}</div>
              <div className="text-[11px] text-muted-foreground">{c.detail}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
