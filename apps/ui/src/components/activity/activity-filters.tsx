"use client";

import { AUDIT_ACTIONS, MODULE_LABELS } from "@/lib/audit/types";
import type { AuditModule } from "@/lib/audit/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface ActivityFiltersProps {
  filters: {
    moduleFilter: string;
    setModuleFilter: (v: string) => void;
    actorFilter: string;
    setActorFilter: (v: string) => void;
    actionFilter: string;
    setActionFilter: (v: string) => void;
  };
}

const modules = Object.entries(MODULE_LABELS) as [AuditModule, string][];

export function ActivityFilters({ filters }: ActivityFiltersProps) {
  const hasActiveFilters =
    filters.moduleFilter !== "all" ||
    filters.actorFilter !== "all" ||
    filters.actionFilter !== "all";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select value={filters.moduleFilter} onValueChange={filters.setModuleFilter}>
        <SelectTrigger className="h-7 w-[120px] text-xs">
          <SelectValue placeholder="Module" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Modules</SelectItem>
          {modules.map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.actorFilter} onValueChange={filters.setActorFilter}>
        <SelectTrigger className="h-7 w-[120px] text-xs">
          <SelectValue placeholder="Actor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Actors</SelectItem>
          <SelectItem value="human">Human</SelectItem>
          <SelectItem value="agent">Agents</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.actionFilter} onValueChange={filters.setActionFilter}>
        <SelectTrigger className="h-7 w-[120px] text-xs">
          <SelectValue placeholder="Action" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Actions</SelectItem>
          {AUDIT_ACTIONS.map((a) => (
            <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={() => {
            filters.setModuleFilter("all");
            filters.setActorFilter("all");
            filters.setActionFilter("all");
          }}
        >
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
