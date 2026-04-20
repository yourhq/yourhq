"use client";

import { Suspense, useState, useCallback } from "react";
import { useOrganizations } from "@/hooks/use-organizations";
import { ORG_TYPES } from "@/lib/organizations/types";
import { OrgList } from "@/components/organizations/org-list";
import { OrgForm } from "@/components/organizations/org-form";
import { ImportWizard } from "@/components/import/import-wizard";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  RefreshCw,
  Search,
  Archive,
  Building2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ColumnToggle } from "@/components/shared/column-toggle";
import type { ColumnToggleItem } from "@/lib/columns/types";

interface ColumnToggleState {
  toggleItems: ColumnToggleItem[];
  onToggleColumn: (id: string) => void;
  onResetColumns: () => void;
}

function OrganizationsContent() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [columnToggle, setColumnToggle] = useState<ColumnToggleState | null>(null);
  const { organizations, loading, filters, actions, form } = useOrganizations();

  const handleColumnToggleChange = useCallback((state: ColumnToggleState) => {
    setColumnToggle(state);
  }, []);

  const typeLabel =
    filters.typeFilter !== "all"
      ? ORG_TYPES.find((t) => t.value === filters.typeFilter)?.label
      : null;

  const hasSearch = filters.globalFilter.trim().length > 0;
  const hasAnyChip = hasSearch || !!typeLabel || filters.showArchived;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Building2 className="h-4 w-4" />}
        title="Organizations"
        description="Companies, teams, and groups in your network."
      />

      <div className="shrink-0 border-b border-border/60 px-5 py-3">
        <TooltipProvider>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search organizations..."
                  value={filters.globalFilter}
                  onChange={(e) => filters.setGlobalFilter(e.target.value)}
                  className="h-8 pl-8 text-[13px]"
                />
              </div>

              <Select
                value={filters.typeFilter}
                onValueChange={filters.setTypeFilter}
              >
                <SelectTrigger
                  size="sm"
                  className={cn(
                    "min-w-[120px] text-[12px]",
                    filters.typeFilter !== "all" &&
                      "border-foreground/30 bg-accent/50"
                  )}
                >
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {ORG_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={filters.showArchived ? "secondary" : "outline"}
                    size="icon-sm"
                    onClick={() => filters.setShowArchived(!filters.showArchived)}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {filters.showArchived ? "Hide archived" : "Show archived"}
                </TooltipContent>
              </Tooltip>

              <div className="flex-1" />

              <span className="text-[11px] text-muted-foreground tabular-nums">
                {organizations.length}{" "}
                {organizations.length === 1 ? "org" : "orgs"}
              </span>

              {columnToggle && (
                <ColumnToggle
                  items={columnToggle.toggleItems}
                  onToggle={columnToggle.onToggleColumn}
                  onReset={columnToggle.onResetColumns}
                />
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={actions.fetchOrganizations}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>

              <Button variant="outline" size="sm" onClick={() => setShowImportWizard(true)}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Import
              </Button>

              <Button size="sm" onClick={form.openCreateForm}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New organization
              </Button>
            </div>

            {hasAnyChip && (
              <div className="flex flex-wrap items-center gap-1.5">
                {hasSearch && (
                  <FilterChip
                    label={`Search: "${filters.globalFilter}"`}
                    onRemove={() => filters.setGlobalFilter("")}
                  />
                )}
                {typeLabel && (
                  <FilterChip
                    label={`Type: ${typeLabel}`}
                    onRemove={() => filters.setTypeFilter("all")}
                  />
                )}
                {filters.showArchived && (
                  <FilterChip
                    label="Showing archived"
                    onRemove={() => filters.setShowArchived(false)}
                  />
                )}
                <button
                  type="button"
                  onClick={filters.clearFilters}
                  className="ml-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </TooltipProvider>
      </div>

      <div className="flex-1 overflow-auto p-5">
        <OrgList
          organizations={organizations}
          loading={loading}
          hasFilters={filters.hasActiveFilters}
          onEdit={form.openEditForm}
          onArchive={actions.handleArchiveOrg}
          onRestore={actions.handleRestoreOrg}
          onDelete={setDeleteId}
          showArchived={filters.showArchived}
          onClearFilters={filters.clearFilters}
          onAddOrg={form.openCreateForm}
          onColumnToggleChange={handleColumnToggleChange}
        />
      </div>

      <OrgForm
        open={form.showForm}
        onClose={form.closeForm}
        organization={form.editingOrg}
        onSaved={form.onFormSaved}
      />

      <ImportWizard
        entityType="organization"
        open={showImportWizard}
        onClose={() => setShowImportWizard(false)}
        onComplete={actions.fetchOrganizations}
      />

      <ConfirmDeleteDialog
        open={!!deleteId}
        onConfirm={() => {
          if (deleteId) actions.handleDeleteOrg(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
        title="Delete organization permanently?"
        description="This action cannot be undone. The organization and its links to contacts will be permanently removed."
      />
    </div>
  );
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

export default function OrganizationsPage() {
  return (
    <Suspense>
      <OrganizationsContent />
    </Suspense>
  );
}
