"use client";

import { useState } from "react";
import { PRIORITIES } from "@/lib/crm/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import {
  Plus,
  Clock,
  RefreshCw,
  List,
  LayoutGrid,
  Columns3,
  Search,
  Archive,
  Upload,
  X,
  SlidersHorizontal,
  MoreVertical,
} from "lucide-react";
import type { ViewMode } from "@/hooks/use-contacts";
import { cn } from "@/lib/utils";
import { ColumnToggle } from "@/components/shared/column-toggle";
import type { ColumnToggleItem } from "@/lib/columns/types";

interface ContactsFilterBarProps {
  contactCount: number;
  totalCount?: number;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (value: string) => void;
  followUpFilter: boolean;
  onFollowUpFilterChange: (value: boolean) => void;
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onRefresh: () => void;
  onAddContact: () => void;
  onImport: () => void;
  onClearFilters: () => void;
  columnToggle?: {
    toggleItems: ColumnToggleItem[];
    onToggleColumn: (id: string) => void;
    onResetColumns: () => void;
  } | null;
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="group inline-flex h-6 items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 text-[11px] text-foreground transition-colors hover:border-border hover:bg-accent"
    >
      <span>{label}</span>
      <X className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
    </button>
  );
}

export function ContactsFilterBar({
  contactCount,
  totalCount,
  globalFilter,
  onGlobalFilterChange,
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  followUpFilter,
  onFollowUpFilterChange,
  showArchived,
  onShowArchivedChange,
  viewMode,
  onViewModeChange,
  onRefresh,
  onAddContact,
  onImport,
  onClearFilters,
  columnToggle,
}: ContactsFilterBarProps) {
  const mobile = useIsMobile();
  const [filterOpen, setFilterOpen] = useState(false);
  const { stages, stagesByKey } = usePipelineStages("contact");

  const activeStatusLabel =
    statusFilter !== "all" ? stagesByKey[statusFilter]?.label : null;
  const activePriorityLabel =
    priorityFilter !== "all"
      ? PRIORITIES.find((p) => p.value === priorityFilter)?.label
      : null;

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0) +
    (followUpFilter ? 1 : 0) +
    (globalFilter.trim().length > 0 ? 1 : 0);

  const hasAnyActive = activeFilterCount > 0 || showArchived;

  const filterChips = hasAnyActive && (
    <div className="flex flex-wrap items-center gap-1.5">
      {globalFilter.trim() && (
        <FilterChip
          label={`Search: "${globalFilter}"`}
          onRemove={() => onGlobalFilterChange("")}
        />
      )}
      {activeStatusLabel && (
        <FilterChip
          label={`Status: ${activeStatusLabel}`}
          onRemove={() => onStatusFilterChange("all")}
        />
      )}
      {activePriorityLabel && (
        <FilterChip
          label={`Priority: ${activePriorityLabel}`}
          onRemove={() => onPriorityFilterChange("all")}
        />
      )}
      {followUpFilter && (
        <FilterChip
          label="Due only"
          onRemove={() => onFollowUpFilterChange(false)}
        />
      )}
      {showArchived && (
        <FilterChip
          label="Showing archived"
          onRemove={() => onShowArchivedChange(false)}
        />
      )}
      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={onClearFilters}
          className="ml-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Clear all
        </button>
      )}
    </div>
  );

  if (mobile) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={globalFilter}
              onChange={(e) => onGlobalFilterChange(e.target.value)}
              className="h-9 pl-8 text-[13px]"
            />
          </div>

          <Drawer open={filterOpen} onOpenChange={setFilterOpen}>
            <DrawerTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 relative">
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </DrawerTrigger>
            <DrawerContent className="px-4 pb-6">
              <div className="mx-auto mt-4 h-1 w-10 rounded-full bg-muted" />
              <div className="space-y-4 pt-4">
                <h3 className="text-sm font-medium">Filters</h3>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</label>
                    <Select value={statusFilter} onValueChange={onStatusFilterChange}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {stages.map((s) => (
                          <SelectItem key={s.stage_key} value={s.stage_key}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Priority</label>
                    <Select value={priorityFilter} onValueChange={onPriorityFilterChange}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="All priorities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All priorities</SelectItem>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      variant={followUpFilter ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => onFollowUpFilterChange(!followUpFilter)}
                      className="h-10 text-sm flex-1"
                    >
                      <Clock className="mr-1.5 h-4 w-4" />
                      Due
                    </Button>
                    <Button
                      variant={showArchived ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => onShowArchivedChange(!showArchived)}
                      className="h-10 text-sm flex-1"
                    >
                      <Archive className="mr-1.5 h-4 w-4" />
                      Archived
                    </Button>
                  </div>
                </div>

                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { onClearFilters(); setFilterOpen(false); }}
                    className="w-full text-sm"
                  >
                    Clear all filters
                  </Button>
                )}
              </div>
            </DrawerContent>
          </Drawer>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRefresh}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Refresh
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onImport}>
                <Upload className="mr-2 h-3.5 w-3.5" />
                Import
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="icon" className="h-9 w-9 shrink-0" onClick={onAddContact}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {filterChips}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-[320px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={globalFilter}
              onChange={(e) => onGlobalFilterChange(e.target.value)}
              className="h-8 pl-8 text-[13px]"
            />
          </div>

          {/* Status */}
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger
              size="sm"
              className={cn(
                "min-w-[120px] text-[12px]",
                statusFilter !== "all" && "border-foreground/30 bg-accent/50"
              )}
            >
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s.stage_key} value={s.stage_key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority */}
          <Select value={priorityFilter} onValueChange={onPriorityFilterChange}>
            <SelectTrigger
              size="sm"
              className={cn(
                "min-w-[110px] text-[12px]",
                priorityFilter !== "all" && "border-foreground/30 bg-accent/50"
              )}
            >
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Due filter */}
          <Button
            variant={followUpFilter ? "secondary" : "outline"}
            size="sm"
            onClick={() => onFollowUpFilterChange(!followUpFilter)}
            className={cn(
              "h-8 text-[12px]",
              followUpFilter && "border-foreground/30"
            )}
          >
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            Due
          </Button>

          {/* Archived toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showArchived ? "secondary" : "outline"}
                size="icon-sm"
                onClick={() => onShowArchivedChange(!showArchived)}
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showArchived ? "Hide archived" : "Show archived"}
            </TooltipContent>
          </Tooltip>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Count */}
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {totalCount !== undefined && contactCount !== totalCount ? (
              <>
                <span className="text-foreground">{contactCount}</span>
                <span className="mx-0.5">/</span>
                {totalCount} {totalCount === 1 ? "contact" : "contacts"}
              </>
            ) : (
              <>
                {contactCount} {contactCount === 1 ? "contact" : "contacts"}
              </>
            )}
          </span>

          {/* View toggle */}
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && onViewModeChange(v as ViewMode)}
            variant="outline"
            size="sm"
            className="hidden md:flex"
          >
            <ToggleGroupItem value="table" title="Table view" className="h-8 w-8 p-0">
              <List className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="cards" title="Card view" className="h-8 w-8 p-0">
              <LayoutGrid className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="kanban" title="Pipeline view" className="h-8 w-8 p-0">
              <Columns3 className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Column toggle */}
          {columnToggle && (
            <ColumnToggle
              items={columnToggle.toggleItems}
              onToggle={columnToggle.onToggleColumn}
              onReset={columnToggle.onResetColumns}
            />
          )}

          {/* Refresh */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>

          {/* Import */}
          <Button variant="outline" size="sm" onClick={onImport}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Import
          </Button>

          {/* New contact — primary action */}
          <Button size="sm" onClick={onAddContact}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New contact
          </Button>
        </div>

        {/* Active filter chips */}
        {filterChips}
      </div>
    </TooltipProvider>
  );
}
