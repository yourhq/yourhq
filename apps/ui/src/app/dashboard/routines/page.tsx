"use client";

import { Suspense } from "react";
import { useRoutines } from "@/hooks/use-routines";
import { RoutinesTable } from "@/components/routines/routines-table";
import { RoutineForm } from "@/components/routines/routine-form";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Repeat, Search } from "lucide-react";
import type { TriggerType } from "@/lib/routines/types";

function RoutinesContent() {
  const { routines, loading, filters, actions, form } = useRoutines();
  const hasFilters = filters.search.trim() !== "" || filters.triggerFilter !== "all";

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Repeat className="h-4 w-4" />}
        title="Routines"
        description="Scheduled checks and event-driven agent behaviors."
        primaryAction={
          <Button size="sm" onClick={form.openCreateForm}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New routine
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-border/30">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => filters.setSearch(e.target.value)}
            placeholder="Search routines..."
            className="h-7 pl-8 text-xs"
          />
        </div>

        <Select
          value={filters.triggerFilter}
          onValueChange={(v) => filters.setTriggerFilter(v as "all" | TriggerType)}
        >
          <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="schedule">Schedule</SelectItem>
            <SelectItem value="event">Event</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <LoadingSkeleton variant="table" count={5} />
        ) : routines.length === 0 && !hasFilters ? (
          <EmptyState
            icon={Repeat}
            title="No routines yet"
            description="Create routines to give agents ongoing behaviors — scheduled checks, event reactions, monitoring."
            action={{
              label: "New routine",
              onClick: form.openCreateForm,
            }}
          />
        ) : routines.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="No routines match"
            description="Try adjusting your search or filter."
            variant="filtered"
            onClearFilters={() => {
              filters.setSearch("");
              filters.setTriggerFilter("all");
            }}
          />
        ) : (
          <RoutinesTable
            routines={routines}
            onEdit={form.openEditForm}
            onDelete={actions.deleteRoutine}
            onToggleActive={actions.toggleActive}
          />
        )}
      </div>

      {form.showForm && (
        <RoutineForm
          editingRoutine={form.editingRoutine}
          onSave={form.onFormSaved}
          onCancel={form.closeForm}
        />
      )}
    </div>
  );
}

export default function RoutinesPage() {
  return (
    <Suspense>
      <RoutinesContent />
    </Suspense>
  );
}
