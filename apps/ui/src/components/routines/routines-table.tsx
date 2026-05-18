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
import type { Routine } from "@/lib/routines/types";
import { TRIGGER_TYPE_COLORS } from "@/lib/routines/types";
import { humanizeRoutine } from "@/lib/routines/humanize";
import { useIsMobile } from "@/hooks/use-mobile";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { ArrowUpDown, Bot, Clock, MoreHorizontal, Pencil, Play, Trash2, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface RoutinesTableProps {
  routines: Routine[];
  onEdit: (routine: Routine) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, currentState: boolean) => void;
  onRunNow?: (id: string) => void;
}

export function RoutinesTable({
  routines,
  onEdit,
  onDelete,
  onToggleActive,
  onRunNow,
}: RoutinesTableProps) {
  const mobile = useIsMobile();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns: ColumnDef<Routine>[] = [
    {
      id: "routine",
      accessorFn: (row) => row.name,
      header: ({ column }) => (
        <button
          type="button"
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => column.toggleSorting()}
        >
          Routine
          {column.getIsSorted() && <ArrowUpDown className="h-3 w-3" />}
        </button>
      ),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-foreground truncate">
                {r.name}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              {humanizeRoutine(r)}
            </p>
          </div>
        );
      },
    },
    {
      id: "type",
      header: "Type",
      size: 100,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <Badge
            variant="secondary"
            className={TRIGGER_TYPE_COLORS[r.trigger_type]}
          >
            {r.trigger_type === "schedule" ? (
              <Clock className="mr-1 h-3 w-3" />
            ) : (
              <Zap className="mr-1 h-3 w-3" />
            )}
            {r.trigger_type === "schedule" ? "Schedule" : "Event"}
          </Badge>
        );
      },
    },
    {
      id: "agent",
      header: "Agent",
      size: 140,
      cell: ({ row }) => {
        const agent = row.original.agent;
        return (
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm">
              {(agent?.meta?.emoji as string) || <Bot className="h-3 w-3 text-muted-foreground" />}
            </div>
            <span className="text-xs text-muted-foreground truncate">
              {agent?.name ?? row.original.agent_slug}
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
          onCheckedChange={() =>
            onToggleActive(row.original.id, row.original.is_active)
          }
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
    {
      id: "nextRun",
      accessorFn: (row) => row.next_run_at,
      header: "Next run",
      size: 110,
      cell: ({ row }) => {
        const r = row.original;
        if (r.trigger_type !== "schedule" || !r.is_active || !r.next_run_at) {
          return <span className="text-[11px] text-muted-foreground/50">—</span>;
        }
        return (
          <span className="text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(r.next_run_at), { addSuffix: true })}
          </span>
        );
      },
    },
    {
      id: "lastRun",
      accessorFn: (row) => row.last_run_at,
      header: ({ column }) => (
        <button
          type="button"
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => column.toggleSorting()}
        >
          Last run
          {column.getIsSorted() && <ArrowUpDown className="h-3 w-3" />}
        </button>
      ),
      size: 110,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.last_run_at) {
          return <span className="text-[11px] text-muted-foreground/50">Never</span>;
        }
        return (
          <span className="text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(r.last_run_at), { addSuffix: true })}
          </span>
        );
      },
    },
    {
      id: "runCount",
      accessorFn: (row) => row.run_count,
      header: ({ column }) => (
        <button
          type="button"
          className="flex items-center gap-1 hover:text-foreground"
          onClick={() => column.toggleSorting()}
        >
          Runs
          {column.getIsSorted() && <ArrowUpDown className="h-3 w-3" />}
        </button>
      ),
      size: 60,
      cell: ({ row }) => (
        <span className="text-[11px] text-muted-foreground">
          {row.original.run_count}
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
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
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
            {onRunNow && (
              <DropdownMenuItem onClick={() => onRunNow(row.original.id)}>
                <Play className="mr-2 h-3.5 w-3.5" />
                Run now
              </DropdownMenuItem>
            )}
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
    data: routines,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
    onSortingChange: setSorting,
  });

  if (mobile) {
    return (
      <>
        <div className="space-y-2">
          {routines.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex w-full items-start gap-3 rounded-lg border border-border/50 p-3 text-left transition-colors hover:bg-accent/30 active:bg-accent/50"
              onClick={() => onEdit(r)}
            >
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{r.name}</span>
                  <Badge
                    variant="secondary"
                    className={TRIGGER_TYPE_COLORS[r.trigger_type]}
                  >
                    {r.trigger_type === "schedule" ? (
                      <Clock className="mr-1 h-3 w-3" />
                    ) : (
                      <Zap className="mr-1 h-3 w-3" />
                    )}
                    {r.trigger_type === "schedule" ? "Schedule" : "Event"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {humanizeRoutine(r)}
                </p>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    {(r.agent?.meta?.emoji as string) || <Bot className="h-3 w-3" />}
                    {r.agent?.name ?? r.agent_slug}
                  </span>
                  {r.last_run_at && (
                    <span>{formatDistanceToNow(new Date(r.last_run_at), { addSuffix: true })}</span>
                  )}
                  <span>{r.run_count} runs</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 pt-0.5">
                <Switch
                  data-size="sm"
                  checked={r.is_active}
                  onCheckedChange={() => onToggleActive(r.id, r.is_active)}
                  onClick={(e) => e.stopPropagation()}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => onEdit(r)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </DropdownMenuItem>
                    {onRunNow && (
                      <DropdownMenuItem onClick={() => onRunNow(r.id)}>
                        <Play className="mr-2 h-3.5 w-3.5" />
                        Run now
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteId(r.id)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </button>
          ))}
        </div>

        <AlertDialog
          open={!!deleteId}
          onOpenChange={(open) => !open && setDeleteId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete routine?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove this routine. Existing inbox items
                will not be affected.
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

  return (
    <>
      <div className="rounded-md border border-border/50">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-[11px] font-medium text-muted-foreground h-8"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
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

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete routine?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this routine. Existing inbox items
              will not be affected.
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
