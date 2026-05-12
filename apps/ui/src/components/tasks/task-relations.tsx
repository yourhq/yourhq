"use client";

import { useRef, useState } from "react";
import { useTaskRelations } from "@/hooks/use-task-relations";
import type { TaskRelationType } from "@/lib/tasks/types";
import { RELATION_TYPES } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import {
  GitBranch,
  Plus,
  X,
  Ban,
  ShieldAlert,
  Link2,
  CornerDownRight,
} from "lucide-react";

const STATUS_DOTS: Record<string, string> = {
  todo: "bg-muted-foreground/40",
  in_progress: "bg-status-info",
  blocked: "bg-status-error",
  done: "bg-status-success",
  cancelled: "bg-muted-foreground/30",
  missed: "bg-status-warning",
};

const RELATION_ICONS: Record<string, typeof Ban> = {
  blocked_by: Ban,
  blocks: ShieldAlert,
  relates_to: Link2,
  parent_of: GitBranch,
  child_of: CornerDownRight,
};

interface TaskRelationsProps {
  taskId: string;
}

export function TaskRelations({ taskId }: TaskRelationsProps) {
  const { relations, actions } = useTaskRelations(taskId);
  const [open, setOpen] = useState(false);
  const [relationType, setRelationType] = useState<TaskRelationType>("blocked_by");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; title: string; status: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const found = await actions.searchTasks(value);
      const existingIds = new Set(relations.map((r) => r.related_task?.id).filter(Boolean));
      setResults(found.filter((t) => !existingIds.has(t.id)));
      setSearching(false);
    }, 300);
  }

  async function handleSelect(targetId: string) {
    await actions.addRelation(targetId, relationType);
    setSearch("");
    setResults([]);
    setOpen(false);
  }

  const blockerRelations = relations.filter(
    (r) => r.relation_type === "blocked_by" || r.relation_type === "blocks"
  );
  const otherRelations = relations.filter(
    (r) => r.relation_type !== "blocked_by" && r.relation_type !== "blocks"
  );
  const sortedRelations = [...blockerRelations, ...otherRelations];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Relations
            {relations.length > 0 && (
              <span className="ml-1 text-muted-foreground/60">{relations.length}</span>
            )}
          </span>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <RelationPickerContent
            relationType={relationType}
            setRelationType={setRelationType}
            search={search}
            onSearch={handleSearch}
            results={results}
            searching={searching}
            onSelect={handleSelect}
          />
        </Popover>
      </div>

      {sortedRelations.length > 0 && (
        <div className="space-y-0.5">
          {sortedRelations.map((rel) => {
            const meta = RELATION_TYPES.find((r) => r.value === rel.relation_type);
            const Icon = RELATION_ICONS[rel.relation_type] ?? Link2;
            const isBlocker = rel.relation_type === "blocked_by";

            return (
              <div
                key={rel.id}
                className={cn(
                  "group flex items-center gap-2 rounded px-2 py-1 hover:bg-accent/40 transition-colors",
                  isBlocker && "border-l-2 border-status-error/40"
                )}
              >
                <Icon className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                <span className="text-[11px] text-muted-foreground/60 shrink-0 w-16 truncate">
                  {meta?.label}
                </span>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    STATUS_DOTS[rel.related_task?.status ?? "todo"]
                  )}
                />
                <span className="text-sm truncate flex-1">
                  {rel.related_task?.title ?? "Unknown task"}
                </span>
                {rel.related_task?.assignee_agent?.name && (
                  <span className="text-[10px] text-muted-foreground/50 shrink-0">
                    {rel.related_task.assignee_agent.name}
                  </span>
                )}
                <button
                  onClick={() => actions.removeRelation(rel.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RelationPickerContent({
  relationType,
  setRelationType,
  search,
  onSearch,
  results,
  searching,
  onSelect,
}: {
  relationType: TaskRelationType;
  setRelationType: (v: TaskRelationType) => void;
  search: string;
  onSearch: (v: string) => void;
  results: { id: string; title: string; status: string }[];
  searching: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <PopoverContent className="w-80 p-0" portal={false} align="start">
      <div className="p-2 border-b border-border/40">
        <Select value={relationType} onValueChange={(v) => setRelationType(v as TaskRelationType)}>
          <SelectTrigger className="h-7 text-xs">
            <span>{RELATION_TYPES.find((r) => r.value === relationType)?.label}</span>
          </SelectTrigger>
          <SelectContent portal={false}>
            {RELATION_TYPES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search tasks..."
          value={search}
          onValueChange={onSearch}
        />
        <CommandList>
          {!searching && search && results.length === 0 && (
            <CommandEmpty>No tasks found</CommandEmpty>
          )}
          {results.map((task) => (
            <CommandItem
              key={task.id}
              value={task.id}
              onSelect={() => onSelect(task.id)}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  STATUS_DOTS[task.status]
                )}
              />
              <span className="truncate">{task.title}</span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </PopoverContent>
  );
}
