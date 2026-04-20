"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Organization } from "@/lib/organizations/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Pencil,
  Archive,
  RotateCcw,
  Trash2,
  Building2,
} from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { getOrgColumnConfigs } from "@/lib/columns/org-columns";
import { buildExtendedColumnConfigs } from "@/lib/columns/extended-columns";
import { useColumnVisibility } from "@/hooks/use-column-visibility";
import type { ColumnToggleItem } from "@/lib/columns/types";

interface OrgListProps {
  organizations: Organization[];
  loading: boolean;
  hasFilters: boolean;
  onEdit: (org: Organization) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  showArchived: boolean;
  onClearFilters: () => void;
  onAddOrg: () => void;
  onColumnToggleChange?: (props: {
    toggleItems: ColumnToggleItem[];
    onToggleColumn: (id: string) => void;
    onResetColumns: () => void;
  }) => void;
}

export function OrgList({
  organizations,
  loading,
  hasFilters,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
  onClearFilters,
  onAddOrg,
  onColumnToggleChange,
}: OrgListProps) {
  const router = useRouter();
  const { stagesByKey } = usePipelineStages("organization");
  const { fields } = useFieldDefinitions("organization");

  const columnConfigs = useMemo(() => {
    const standard = getOrgColumnConfigs({ stagesByKey });
    const extended = buildExtendedColumnConfigs<Organization>(fields);
    return [...standard, ...extended];
  }, [stagesByKey, fields]);

  const { columnVisibility, toggleColumn, resetToDefaults, toggleItems } =
    useColumnVisibility("organization", columnConfigs);

  // Expose toggle controls to parent
  useEffect(() => {
    onColumnToggleChange?.({
      toggleItems,
      onToggleColumn: toggleColumn,
      onResetColumns: resetToDefaults,
    });
  }, [toggleItems, toggleColumn, resetToDefaults, onColumnToggleChange]);

  // Build final columns with actions cell wired up
  const columns: ColumnDef<Organization>[] = useMemo(
    () =>
      columnConfigs.map((config) => {
        const def = { ...config.columnDef };

        if (config.id === "actions") {
          def.cell = ({ row }) => {
            const org = row.original;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 transition-opacity group-hover/row:opacity-100 data-[state=open]:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Row actions"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onClick={(e) => e.stopPropagation()}
                >
                  {showArchived ? (
                    <>
                      <DropdownMenuItem onClick={() => onRestore(org.id)}>
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        Restore
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(org.id)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete permanently
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => onEdit(org)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onArchive(org.id)}>
                        <Archive className="mr-2 h-3.5 w-3.5" />
                        Archive
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          };
        }

        return def;
      }),
    [columnConfigs, onEdit, onArchive, onRestore, onDelete, showArchived]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: organizations,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: { columnVisibility },
  });

  if (!loading && organizations.length === 0) {
    return hasFilters ? (
      <EmptyState
        icon={Building2}
        title="No organizations match your filters"
        description="Try clearing filters to see all organizations."
        variant="filtered"
        onClearFilters={onClearFilters}
      />
    ) : (
      <EmptyState
        icon={Building2}
        title="No organizations yet"
        description="Add your first organization to start tracking companies and deals."
        action={{ label: "Add organization", onClick: onAddOrg }}
      />
    );
  }

  return (
    <DataTable
      table={table}
      isLoading={loading}
      onRowClick={(row) =>
        router.push(`/dashboard/organizations/${row.original.id}`)
      }
    />
  );
}
