"use client";

import { useEffect, useMemo } from "react";
import {
  ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Contact } from "@/lib/crm/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  MoreHorizontal,
  ArrowRightLeft,
  Pencil,
  Archive,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ContactsEmpty } from "./contacts-empty";
import { getContactColumnConfigs } from "@/lib/columns/contact-columns";
import { buildExtendedColumnConfigs } from "@/lib/columns/extended-columns";
import { useColumnVisibility } from "@/hooks/use-column-visibility";
import type { ColumnToggleItem } from "@/lib/columns/types";

interface ContactsTableViewProps {
  contacts: Contact[];
  loading: boolean;
  hasFilters: boolean;
  sorting: SortingState;
  onSortingChange: (updater: SortingState | ((prev: SortingState) => SortingState)) => void;
  onSelect: (contact: Contact) => void;
  onStatusChange: (id: string, status: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  showArchived: boolean;
  onClearFilters: () => void;
  onAddContact: () => void;
  onColumnToggleChange?: (props: {
    toggleItems: ColumnToggleItem[];
    onToggleColumn: (id: string) => void;
    onResetColumns: () => void;
  }) => void;
}

function SortableHeader({
  label,
  sorted,
  onClick,
}: {
  label: string;
  sorted: false | "asc" | "desc";
  onClick: () => void;
}) {
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-label hover:text-foreground transition-colors"
    >
      <span>{label}</span>
      <Icon className={cn("h-3 w-3", sorted ? "text-foreground" : "text-muted-foreground/60")} />
    </button>
  );
}

function RowActions({
  contact,
  onSelect,
  onStatusChange,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
  stages,
}: {
  contact: Contact;
  onSelect: (c: Contact) => void;
  onStatusChange: (id: string, status: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  showArchived: boolean;
  stages: { stage_key: string; label: string }[];
}) {
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
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {showArchived ? (
          <>
            <DropdownMenuItem onClick={() => onRestore(contact.id)}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Restore
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(contact.id)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete permanently
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onClick={() => onSelect(contact)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Open
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                Change status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {stages.map((s) => (
                  <DropdownMenuItem
                    key={s.stage_key}
                    onClick={() => onStatusChange(contact.id, s.stage_key)}
                    disabled={s.stage_key === contact.status}
                  >
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onArchive(contact.id)}>
              <Archive className="mr-2 h-3.5 w-3.5" />
              Archive
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContactsTableView({
  contacts,
  loading,
  hasFilters,
  sorting,
  onSortingChange,
  onSelect,
  onStatusChange,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
  onClearFilters,
  onAddContact,
  onColumnToggleChange,
}: ContactsTableViewProps) {
  const { stages, stagesByKey } = usePipelineStages("contact");
  const { fields } = useFieldDefinitions("contact");

  const columnConfigs = useMemo(() => {
    const standard = getContactColumnConfigs({ stagesByKey });
    const extended = buildExtendedColumnConfigs<Contact>(fields);
    return [...standard, ...extended];
  }, [stagesByKey, fields]);

  const { columnVisibility, toggleColumn, resetToDefaults, toggleItems } =
    useColumnVisibility("contact", columnConfigs);

  // Expose toggle controls to parent (filter bar)
  useEffect(() => {
    onColumnToggleChange?.({
      toggleItems,
      onToggleColumn: toggleColumn,
      onResetColumns: resetToDefaults,
    });
  }, [toggleItems, toggleColumn, resetToDefaults, onColumnToggleChange]);

  // Build final columns with sortable headers and actions cell
  const columns: ColumnDef<Contact>[] = useMemo(
    () =>
      columnConfigs.map((config) => {
        const def = { ...config.columnDef };

        // Add sortable headers for sortable standard columns
        if (config.id === "name") {
          def.header = ({ column }) => (
            <SortableHeader
              label="Contact"
              sorted={column.getIsSorted()}
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            />
          );
        } else if (config.id === "company") {
          def.header = ({ column }) => (
            <SortableHeader
              label="Company"
              sorted={column.getIsSorted()}
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            />
          );
        } else if (config.id === "last_contact_date") {
          def.header = ({ column }) => (
            <SortableHeader
              label="Last contact"
              sorted={column.getIsSorted()}
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            />
          );
        }

        // Wire up actions cell with callbacks
        if (config.id === "actions") {
          def.cell = ({ row }) => (
            <RowActions
              contact={row.original}
              onSelect={onSelect}
              onStatusChange={onStatusChange}
              onArchive={onArchive}
              onRestore={onRestore}
              onDelete={onDelete}
              showArchived={showArchived}
              stages={stages}
            />
          );
        }

        return def;
      }),
    [columnConfigs, onSelect, onStatusChange, onArchive, onRestore, onDelete, showArchived, stages]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: contacts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange,
    state: { sorting, columnVisibility },
  });

  if (!loading && contacts.length === 0) {
    return (
      <ContactsEmpty
        hasFilters={hasFilters}
        onClearFilters={onClearFilters}
        onAddContact={onAddContact}
      />
    );
  }

  return (
    <DataTable
      table={table}
      isLoading={loading}
      onRowClick={(row) => onSelect(row.original)}
    />
  );
}
