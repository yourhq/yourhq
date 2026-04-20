import { Organization, ORG_TYPES } from "@/lib/organizations/types";
import { PipelineStage, DEFAULT_STAGE_COLOR } from "@/lib/fields/types";
import { StatusPill } from "@/components/ui/status-dot";
import { ColumnConfig } from "./types";
import { Globe } from "lucide-react";

function typeLabel(type: string | null) {
  if (!type) return null;
  return ORG_TYPES.find((t) => t.value === type)?.label ?? type;
}

interface OrgColumnDeps {
  stagesByKey: Record<string, PipelineStage>;
}

export function getOrgColumnConfigs(
  deps: OrgColumnDeps
): ColumnConfig<Organization>[] {
  const { stagesByKey } = deps;

  return [
    {
      id: "name",
      label: "Name",
      defaultVisible: true,
      locked: true,
      group: "standard",
      columnDef: {
        accessorKey: "name",
        header: () => <span className="text-label">Name</span>,
        cell: ({ row }) => {
          const org = row.original;
          return (
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-foreground">
                {org.name}
              </div>
              {org.website && (
                <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                  <Globe className="h-2.5 w-2.5 shrink-0" />
                  {org.website.replace(/^https?:\/\//, "")}
                </div>
              )}
            </div>
          );
        },
      },
    },
    {
      id: "type",
      label: "Type",
      defaultVisible: true,
      group: "standard",
      columnDef: {
        accessorKey: "type",
        meta: { className: "hidden md:table-cell" },
        header: () => <span className="text-label">Type</span>,
        cell: ({ row }) => {
          const label = typeLabel(row.original.type);
          if (!label) return null;
          return (
            <span className="text-[12px] text-muted-foreground">{label}</span>
          );
        },
      },
    },
    {
      id: "industry",
      label: "Industry",
      defaultVisible: true,
      group: "standard",
      columnDef: {
        accessorKey: "industry",
        meta: { className: "hidden lg:table-cell" },
        header: () => <span className="text-label">Industry</span>,
        cell: ({ row }) => (
          <span className="truncate text-[12px] text-muted-foreground">
            {row.original.industry}
          </span>
        ),
      },
    },
    {
      id: "location",
      label: "Location",
      defaultVisible: true,
      group: "standard",
      columnDef: {
        accessorKey: "location",
        meta: { className: "hidden xl:table-cell" },
        header: () => <span className="text-label">Location</span>,
        cell: ({ row }) => (
          <span className="truncate text-[12px] text-muted-foreground">
            {row.original.location}
          </span>
        ),
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
          const status = row.original.status;
          if (!status) return null;
          const stage = stagesByKey[status];
          return (
            <StatusPill
              color={stage?.color ?? DEFAULT_STAGE_COLOR}
              label={stage?.label ?? status}
              size="sm"
            />
          );
        },
      },
    },
    {
      id: "contact_count",
      label: "People",
      defaultVisible: true,
      group: "standard",
      columnDef: {
        accessorKey: "contact_count",
        meta: { className: "hidden sm:table-cell", align: "right" },
        header: () => <span className="text-label">People</span>,
        cell: ({ row }) => (
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {row.original.contact_count ?? 0}
          </span>
        ),
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
        cell: () => null, // Replaced at render time in org list
        enableSorting: false,
      },
    },
  ];
}
