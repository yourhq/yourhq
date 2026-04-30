import Link from "next/link";
import { AlertCircle } from "lucide-react";
import type { TaskStats } from "@/lib/types/dashboard";

function TaskStat({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

export function TasksCard({ tasks }: { tasks: TaskStats }) {
  return (
    <section className="rounded-md border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading">Tasks</h2>
        <Link
          href="/dashboard/tasks"
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <TaskStat color="var(--status-neutral)" label="Todo" value={tasks.todo} />
          <TaskStat
            color="var(--status-info)"
            label="In progress"
            value={tasks.inProgress}
          />
          <TaskStat
            color="var(--status-error)"
            label="Blocked"
            value={tasks.blocked}
          />
          <TaskStat
            color="var(--status-success)"
            label="Done"
            value={tasks.done}
          />
        </div>
        {tasks.overdue > 0 && (
          <p className="flex items-center gap-1 text-body text-[var(--status-error)]">
            <AlertCircle className="h-3.5 w-3.5" />
            {tasks.overdue} overdue
          </p>
        )}
      </div>
    </section>
  );
}
