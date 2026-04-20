"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { StreamList } from "@/components/tasks/stream-list";
import { TaskList } from "@/components/tasks/task-list";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TaskBoardView } from "@/components/tasks/task-board-view";
import { SeriesListView } from "@/components/tasks/series-list-view";
import { SeriesForm } from "@/components/tasks/series-form";
import { useStreams } from "@/hooks/use-streams";
import { useTasks } from "@/hooks/use-tasks";
import { useTaskSeries } from "@/hooks/use-task-series";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutList,
  Columns3,
  Plus,
  CheckSquare,
  Archive,
  RefreshCw,
  Repeat,
} from "lucide-react";

type ViewMode = "list" | "board" | "recurring";

const TASKS_VIEW_KEY = "tasks-view-mode";

function TasksContent() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  useEffect(() => {
    const saved = localStorage.getItem(TASKS_VIEW_KEY) as ViewMode | null;
    if (saved && saved !== viewMode) setViewMode(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(TASKS_VIEW_KEY, mode);
  };
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteSeriesId, setDeleteSeriesId] = useState<string | null>(null);
  const streams = useStreams();
  const tasks = useTasks();
  const series = useTaskSeries();

  // Deep-link state: ?task=<id> and ?series=<id>.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openSeriesId = searchParams.get("series");
  const openTaskId = searchParams.get("task");

  const openSeries = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("series", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const closeSeries = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("series");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router, pathname]);

  // When the URL's ?task=<id> changes, sync the modal:
  //  - id present → open it (no-op if already open with same id)
  //  - id cleared AFTER we had one → close modal (browser back)
  // Using a ref to track the previous URL id avoids races with editingTask.
  const prevOpenTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevOpenTaskIdRef.current;
    prevOpenTaskIdRef.current = openTaskId;
    if (openTaskId) {
      if (openTaskId !== (tasks.form.editingTask?.id ?? null)) {
        tasks.form.openTaskById(openTaskId);
      }
    } else if (prev) {
      // URL id was cleared (e.g. browser back)
      tasks.form.closeForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the url id matters
  }, [openTaskId]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<CheckSquare className="h-4 w-4" />}
        title="Tasks"
        description="Plan, assign, and track work across streams."
      />

      <div className="flex flex-1 min-h-0">
        {/* Stream sidebar */}
        <aside className="hidden w-[200px] shrink-0 border-r border-border/60 px-3 py-4 lg:block">
          <StreamList
            streams={streams.streams}
            loading={streams.loading}
            selectedId={tasks.filters.streamFilter}
            onSelect={tasks.filters.setStreamFilter}
            onCreateStream={streams.actions.createStream}
          />
        </aside>

        {/* Main task area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Toolbar */}
          <div className="shrink-0 border-b border-border/60 px-5 py-3">
            <TooltipProvider>
              <div className="flex flex-wrap items-center gap-2">
                <TaskFilters
                  filters={tasks.filters}
                  streams={streams.streams}
                />

                <div className="flex-1" />

                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {viewMode === "recurring"
                    ? `${series.seriesList.length} ${series.seriesList.length === 1 ? "series" : "series"}`
                    : `${tasks.tasks.length} ${tasks.tasks.length === 1 ? "task" : "tasks"}`}
                </span>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={tasks.filters.showArchived ? "secondary" : "outline"}
                      size="icon-sm"
                      onClick={() =>
                        tasks.filters.setShowArchived(!tasks.filters.showArchived)
                      }
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {tasks.filters.showArchived ? "Hide archived" : "Show archived"}
                  </TooltipContent>
                </Tooltip>

                <ToggleGroup
                  type="single"
                  value={viewMode}
                  onValueChange={(v) => v && changeViewMode(v as ViewMode)}
                  variant="outline"
                  size="sm"
                >
                  <ToggleGroupItem
                    value="list"
                    title="List view"
                    className="h-8 w-8 p-0"
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="board"
                    title="Board view"
                    className="h-8 w-8 p-0"
                  >
                    <Columns3 className="h-3.5 w-3.5" />
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="recurring"
                    title="Recurring"
                    className="h-8 w-8 p-0"
                  >
                    <Repeat className="h-3.5 w-3.5" />
                  </ToggleGroupItem>
                </ToggleGroup>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={tasks.actions.fetchTasks}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>

                {!tasks.filters.showArchived && (
                  <Button size="sm" onClick={tasks.form.openCreateForm}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New task
                  </Button>
                )}
              </div>
            </TooltipProvider>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {viewMode === "list" && (
              <TaskList
                tasks={tasks.tasks}
                loading={tasks.loading}
                sorting={tasks.sorting}
                setSorting={tasks.setSorting}
                onStatusChange={tasks.actions.handleStatusChange}
                onSelect={tasks.form.openEditForm}
                onArchive={tasks.actions.handleArchiveTask}
                onRestore={tasks.actions.handleRestoreTask}
                onDelete={setDeleteId}
                showArchived={tasks.filters.showArchived}
                onCreateTask={tasks.form.openCreateForm}
              />
            )}
            {viewMode === "board" && (
              <TaskBoardView
                tasks={tasks.tasks}
                loading={tasks.loading}
                onStatusChange={tasks.actions.handleStatusChange}
                onSelect={tasks.form.openEditForm}
                onArchive={tasks.actions.handleArchiveTask}
                onQuickCreate={tasks.actions.handleQuickCreateTask}
                currentStreamId={
                  tasks.filters.streamFilter !== "all"
                    ? tasks.filters.streamFilter
                    : null
                }
              />
            )}
            {viewMode === "recurring" && (
              <SeriesListView
                seriesList={series.seriesList}
                loading={series.loading}
                onOpen={openSeries}
                onPause={series.actions.pauseSeries}
                onResume={series.actions.resumeSeries}
                onDelete={setDeleteSeriesId}
                onCreate={tasks.form.openCreateForm}
              />
            )}
          </div>

          {tasks.form.showForm && (
            <tasks.form.FormComponent
              streams={streams.streams}
              editingTask={tasks.form.editingTask}
              onSave={tasks.form.onFormSaved}
              onCancel={tasks.form.closeForm}
              onArchive={tasks.actions.handleArchiveTask}
            />
          )}

          <ConfirmDeleteDialog
            open={!!deleteId}
            onConfirm={() => {
              if (deleteId) tasks.actions.handleDeleteTask(deleteId);
              setDeleteId(null);
            }}
            onCancel={() => setDeleteId(null)}
            title="Delete task permanently?"
            description="This action cannot be undone. This task and all its comments and attachments will be permanently removed."
          />

          <ConfirmDeleteDialog
            open={!!deleteSeriesId}
            onConfirm={() => {
              if (deleteSeriesId) series.actions.deleteSeries(deleteSeriesId);
              setDeleteSeriesId(null);
            }}
            onCancel={() => setDeleteSeriesId(null)}
            title="Delete recurring task?"
            description="The series will stop spawning new occurrences. Past task instances stay in history."
          />

          {openSeriesId && (
            <SeriesForm seriesId={openSeriesId} onClose={closeSeries} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksContent />
    </Suspense>
  );
}
