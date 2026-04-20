"use client";

import { useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import type { AutomationRule } from "@/lib/automations/types";
import { RULE_CONDITIONS, RULE_FIELDS } from "@/lib/automations/types";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoreHorizontal, Pencil, Trash2, Bot } from "lucide-react";
import { format } from "date-fns";

function buildRuleSummary(rule: AutomationRule): string {
  const conditionLabel = RULE_CONDITIONS.find((c) => c.value === rule.condition)?.label ?? rule.condition;
  const fieldLabel = RULE_FIELDS.find((f) => f.value === rule.field)?.label ?? rule.field;

  if (rule.condition === "created") {
    return `When ${rule.table_name} is created`;
  }
  if (rule.condition === "any_change") {
    return `When ${rule.table_name}.${fieldLabel} changes`;
  }
  return `When ${rule.table_name}.${fieldLabel} ${conditionLabel.toLowerCase()} "${rule.value}"`;
}

interface AutomationRulesTableProps {
  rules: AutomationRule[];
  onEdit: (rule: AutomationRule) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, currentState: boolean) => void;
}

export function AutomationRulesTable({
  rules,
  onEdit,
  onDelete,
  onToggleActive,
}: AutomationRulesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns: ColumnDef<AutomationRule>[] = [
    {
      id: "rule",
      header: "Rule",
      cell: ({ row }) => {
        const rule = row.original;
        return (
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              {buildRuleSummary(rule)}
            </p>
            {rule.summary_template && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {rule.summary_template}
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: "agent",
      header: "Agent",
      size: 140,
      cell: ({ row }) => {
        const agent = row.original.target_agent;
        return (
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Bot className="h-3 w-3 text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground truncate">
              {agent?.name ?? row.original.target_agent_slug}
            </span>
          </div>
        );
      },
    },
    {
      id: "active",
      header: "Active",
      size: 70,
      cell: ({ row }) => (
        <Switch
          data-size="sm"
          checked={row.original.is_active}
          onCheckedChange={() => onToggleActive(row.original.id, row.original.is_active)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      size: 100,
      cell: ({ row }) => (
        <span className="text-[11px] text-muted-foreground">
          {format(new Date(row.original.created_at), "MMM d, yyyy")}
        </span>
      ),
    },
    {
      id: "actions",
      size: 40,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onEdit(row.original)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleteId(row.original.id)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rules,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    onSortingChange: setSorting,
  });

  return (
    <>
      <div className="rounded-md border border-border/50">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-[11px] font-medium text-muted-foreground h-8">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="group cursor-pointer hover:bg-muted/50"
                onClick={() => onEdit(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete automation rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this automation rule. Existing inbox items will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) onDelete(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
