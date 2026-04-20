import { Contact } from "@/lib/crm/types";
import { PipelineStage, DEFAULT_STAGE_COLOR } from "@/lib/fields/types";
import { StatusPill } from "@/components/ui/status-dot";
import { ColumnConfig } from "./types";
import { formatDistanceToNow } from "date-fns";

const PRIORITY_DOT: Record<NonNullable<Contact["priority"]>, string> = {
  urgent: "var(--priority-urgent)",
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

interface ContactColumnDeps {
  stagesByKey: Record<string, PipelineStage>;
}

export function getContactColumnConfigs(
  deps: ContactColumnDeps
): ColumnConfig<Contact>[] {
  const { stagesByKey } = deps;

  return [
    {
      id: "name",
      label: "Contact",
      defaultVisible: true,
      locked: true,
      group: "standard",
      columnDef: {
        accessorKey: "name",
        header: "Contact",
        cell: ({ row }) => {
          const c = row.original;
          const secondary =
            [c.title, c.company].filter(Boolean).join(" · ") || c.email;
          return (
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-foreground">
                {c.name}
              </div>
              {secondary && (
                <div className="truncate text-[11px] text-muted-foreground">
                  {secondary}
                </div>
              )}
            </div>
          );
        },
      },
    },
    {
      id: "status",
      label: "Status",
      defaultVisible: true,
      group: "standard",
      columnDef: {
        accessorKey: "status",
        header: () => <span className="text-label">Status</span>,
        cell: ({ row }) => {
          const stage = stagesByKey[row.original.status];
          return (
            <StatusPill
              color={stage?.color ?? DEFAULT_STAGE_COLOR}
              label={stage?.label ?? row.original.status}
              size="sm"
            />
          );
        },
        enableSorting: false,
      },
    },
    {
      id: "priority",
      label: "Priority",
      defaultVisible: true,
      group: "standard",
      columnDef: {
        accessorKey: "priority",
        meta: { className: "hidden md:table-cell" },
        header: () => <span className="text-label">Priority</span>,
        cell: ({ row }) => {
          const p = row.original.priority;
          if (!p) return null;
          return (
            <span className="inline-flex items-center gap-1.5 text-[12px] capitalize text-foreground">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: PRIORITY_DOT[p] }}
              />
              {p}
            </span>
          );
        },
        enableSorting: false,
      },
    },
    {
      id: "company",
      label: "Company",
      defaultVisible: true,
      group: "standard",
      columnDef: {
        accessorKey: "company",
        meta: { className: "hidden lg:table-cell" },
        header: "Company",
        cell: ({ row }) => (
          <span className="truncate text-[12px] text-muted-foreground">
            {row.original.company}
          </span>
        ),
      },
    },
    {
      id: "last_contact_date",
      label: "Last contact",
      defaultVisible: true,
      group: "standard",
      columnDef: {
        accessorKey: "last_contact_date",
        meta: { className: "hidden md:table-cell" },
        header: "Last contact",
        cell: ({ row }) => {
          const d = row.original.last_contact_date;
          if (!d) return null;
          return (
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {formatDistanceToNow(new Date(d), { addSuffix: true })}
            </span>
          );
        },
      },
    },
    {
      id: "tags",
      label: "Tags",
      defaultVisible: true,
      group: "standard",
      columnDef: {
        accessorKey: "tags",
        meta: { className: "hidden xl:table-cell" },
        header: () => <span className="text-label">Tags</span>,
        cell: ({ row }) => {
          const tags = row.original.tags ?? [];
          if (tags.length === 0) return null;
          return (
            <div className="flex flex-wrap items-center gap-1">
              {tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="inline-flex h-5 items-center rounded bg-muted/60 px-1.5 text-[11px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
              {tags.length > 2 && (
                <span className="text-[11px] text-muted-foreground">
                  +{tags.length - 2}
                </span>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
    },
    {
      id: "actions",
      label: "Actions",
      defaultVisible: true,
      locked: true,
      group: "standard",
      columnDef: {
        id: "actions",
        meta: { className: "w-10", align: "right" },
        header: () => null,
        cell: () => null, // Replaced at render time in table view
        enableSorting: false,
      },
    },
  ];
}
