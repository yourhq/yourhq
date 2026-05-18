"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CollectionDefinition } from "@/lib/collections/types";
import { useCollectionRecords } from "@/hooks/use-collection-records";
import { CollectionTableView } from "@/components/collections/collection-table-view";
import { CollectionKanbanView } from "@/components/collections/collection-kanban-view";
import { CollectionCalendarView } from "@/components/collections/collection-calendar-view";
import { CollectionViewTabs } from "@/components/collections/collection-view-tabs";
import { CollectionFieldEditor } from "@/components/collections/collection-field-editor";
import { CollectionImportDialog } from "@/components/collections/collection-import-dialog";
import { CollectionSettingsDialog } from "@/components/collections/collection-settings-dialog";
import { CollectionFilterBar, useCollectionFilters } from "@/components/collections/collection-filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { logAudit } from "@/lib/audit/log";
import { toast } from "sonner";
import type { CollectionField, CollectionFieldType, FieldOptions } from "@/lib/collections/types";
import {
  Search,
  Database,
  Plus,
  Archive,
  Upload,
  Settings2,
  ArrowLeft,
  Pencil,
  Columns,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

function CollectionDetailContent() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [collection, setCollection] = useState<CollectionDefinition | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("collection_definitions")
      .select("*")
      .eq("slug", params.slug)
      .single()
      .then(({ data }) => {
        setCollection(data);
        setCollectionLoading(false);
      });
  }, [params.slug]);

  if (collectionLoading) return <LoadingSkeleton variant="table" count={8} />;
  if (!collection) {
    return (
      <EmptyState
        icon={Database}
        title="Collection not found"
        description="This collection doesn't exist or has been deleted."
        action={{ label: "Back to Collections", onClick: () => router.push("/dashboard/collections") }}
      />
    );
  }

  return <CollectionDetailInner collection={collection} />;
}

function CollectionDetailInner({ collection: initialCollection }: { collection: CollectionDefinition }) {
  const router = useRouter();
  const [collection, setCollection] = useState(initialCollection);
  const cr = useCollectionRecords(collection.id);
  const filters = useCollectionFilters();
  const filteredRecords = useMemo(
    () => filters.applyFilters(cr.records, cr.fields),
    [filters, cr.records, cr.fields],
  );
  const [showImport, setShowImport] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null);

  const handleUpdateCollection = useCallback(
    async (
      id: string,
      updates: Partial<Pick<CollectionDefinition, "name" | "description" | "icon" | "color">>,
    ) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("collection_definitions")
        .update(updates)
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await logAudit(supabase, {
        module: "collections",
        entity_type: "collection",
        entity_id: id,
        action: "updated",
        summary: "Updated collection settings",
      });
      toast.success("Collection updated");
      setCollection((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

  const handleAddRecord = useCallback(
    async (defaults?: Record<string, unknown>) => {
      const record = await cr.actions.createRecord(defaults ?? {});
      if (record) {
        router.push(`/dashboard/collections/${collection.slug}/${record.id}`);
      }
    },
    [cr.actions, router, collection.slug],
  );

  const handleRecordClick = useCallback(
    (recordId: string) => {
      router.push(`/dashboard/collections/${collection.slug}/${recordId}`);
    },
    [router, collection.slug],
  );

  return (
    <>
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/collections"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span
              className="flex h-6 w-6 items-center justify-center rounded text-sm"
              style={{
                backgroundColor: (collection.color ?? "#6b7280") + "20",
                color: collection.color ?? "#6b7280",
              }}
            >
              {collection.icon ?? <Database className="h-3.5 w-3.5" />}
            </span>
            {collection.name}
          </div>
        }
        description={collection.description}
        primaryAction={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowSettings(true)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowImport(true)}
            >
              <Upload className="h-3 w-3" />
              Import
            </Button>
            <Button
              variant={showFields ? "secondary" : "outline"}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setShowFields(!showFields)}
            >
              <Settings2 className="h-3 w-3" />
              Fields
            </Button>
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => handleAddRecord()}>
              <Plus className="h-3 w-3" />
              New Record
            </Button>
          </div>
        }
      />

      {/* View tabs */}
      <CollectionViewTabs
        views={cr.views}
        activeView={cr.activeView}
        fields={cr.fields}
        onSelectView={cr.filters.setActiveViewId}
        onCreateView={cr.actions.createView}
        onUpdateView={cr.actions.updateView}
        onDeleteView={cr.actions.deleteView}
      />

      <div className="flex items-center gap-2 border-b border-border/30 px-4 py-1.5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={cr.filters.search}
            onChange={(e) => cr.filters.setSearch(e.target.value)}
            placeholder="Search records..."
            className="h-8 pl-8 text-body border-0 bg-transparent focus-visible:ring-1"
          />
        </div>
        <div className="h-4 w-px bg-border/40" />
        <CollectionFilterBar
          fields={cr.fields}
          conditions={filters.conditions}
          onAdd={filters.addCondition}
          onUpdate={filters.updateCondition}
          onRemove={filters.removeCondition}
          onClearAll={filters.clearAll}
        />
        <Button
          variant={cr.filters.showArchived ? "secondary" : "ghost"}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => cr.filters.setShowArchived(!cr.filters.showArchived)}
        >
          <Archive className="h-3 w-3" />
          Archived
        </Button>
      </div>

      {/* Main area */}
      <div className={cn("flex", showFields && "divide-x divide-border/50")}>
        <div className="flex-1 overflow-hidden">
          {cr.loading ? (
            <LoadingSkeleton variant="table" count={8} />
          ) : cr.records.length === 0 && !cr.filters.search && filters.conditions.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No records yet"
              description="Add your first record or import from a file."
              action={{ label: "New Record", onClick: () => handleAddRecord() }}
              secondaryAction={{ label: "Import CSV", onClick: () => setShowImport(true) }}
            />
          ) : filteredRecords.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No records match"
              description="Try adjusting your search or filters."
              variant="filtered"
              onClearFilters={() => { cr.filters.setSearch(""); filters.clearAll(); }}
            />
          ) : cr.activeView?.view_type === "kanban" && cr.activeView.config.group_by_field ? (
            <CollectionKanbanView
              records={filteredRecords}
              fields={cr.fields}
              groupByFieldKey={cr.activeView.config.group_by_field}
              titleField={cr.titleField}
              onCellChange={cr.actions.updateCell}
              onAddRecord={handleAddRecord}
              onArchiveRecord={cr.actions.archiveRecord}
              onDeleteRecord={(id) => setDeleteRecordId(id)}
              onRecordClick={handleRecordClick}
            />
          ) : cr.activeView?.view_type === "kanban" ? (
            <KanbanConfigPrompt
              fields={cr.fields}
              onConfigure={(fieldKey) =>
                cr.actions.updateView(cr.activeView!.id, { config: { ...cr.activeView!.config, group_by_field: fieldKey } })
              }
              onAddField={cr.actions.addField}
            />
          ) : cr.activeView?.view_type === "calendar" && cr.activeView.config.date_field ? (
            <CollectionCalendarView
              records={filteredRecords}
              fields={cr.fields}
              dateFieldKey={cr.activeView.config.date_field}
              titleField={cr.titleField}
              onAddRecord={handleAddRecord}
              onArchiveRecord={cr.actions.archiveRecord}
              onDeleteRecord={(id) => setDeleteRecordId(id)}
              onRecordClick={handleRecordClick}
            />
          ) : cr.activeView?.view_type === "calendar" ? (
            <CalendarConfigPrompt
              fields={cr.fields}
              onConfigure={(fieldKey) =>
                cr.actions.updateView(cr.activeView!.id, { config: { ...cr.activeView!.config, date_field: fieldKey } })
              }
              onAddField={cr.actions.addField}
            />
          ) : (
            <CollectionTableView
              records={filteredRecords}
              fields={cr.fields}
              viewConfig={cr.activeView?.config ?? {}}
              onCellChange={cr.actions.updateCell}
              onAddRecord={() => handleAddRecord()}
              onArchiveRecord={cr.actions.archiveRecord}
              onDeleteRecord={(id) => setDeleteRecordId(id)}
              onRecordClick={handleRecordClick}
            />
          )}
        </div>

        {/* Field editor sidebar */}
        {showFields && (
          <div className="w-[280px] shrink-0 overflow-y-auto p-3">
            <CollectionFieldEditor
              fields={cr.fields}
              onAddField={cr.actions.addField}
              onUpdateField={cr.actions.updateField}
              onDeleteField={cr.actions.deleteField}
              onReorderFields={cr.actions.reorderFields}
            />
          </div>
        )}
      </div>

      <CollectionImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        fields={cr.fields}
        onImport={cr.actions.importRecords}
      />

      <CollectionSettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        collection={collection}
        onSave={handleUpdateCollection}
      />

      <ConfirmDeleteDialog
        open={!!deleteRecordId}
        title="Delete record?"
        description="This will permanently delete this record. This cannot be undone."
        onConfirm={async () => {
          if (deleteRecordId) await cr.actions.deleteRecord(deleteRecordId);
          setDeleteRecordId(null);
        }}
        onCancel={() => setDeleteRecordId(null)}
      />
    </>
  );
}

function KanbanConfigPrompt({
  fields,
  onConfigure,
  onAddField,
}: {
  fields: CollectionField[];
  onConfigure: (fieldKey: string) => void;
  onAddField: (input: { field_key: string; field_type: CollectionFieldType; label: string; options?: FieldOptions }) => void;
}) {
  const selectFields = fields.filter((f) => f.field_type === "select" && f.is_active);

  if (selectFields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/60 mb-3">
          <Columns className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="text-[14px] font-medium">Board view needs a status field</h3>
        <p className="mt-1 text-[13px] text-muted-foreground max-w-sm">
          Add a select field to group records into columns.
        </p>
        <Button
          size="sm"
          className="mt-4 h-8 gap-1.5 text-xs"
          onClick={() =>
            onAddField({
              field_key: "status",
              field_type: "select",
              label: "Status",
              options: {
                choices: [
                  { value: "todo", label: "To Do", color: "#6b7280" },
                  { value: "in_progress", label: "In Progress", color: "#3b82f6" },
                  { value: "done", label: "Done", color: "#22c55e" },
                ],
              },
            })
          }
        >
          <Plus className="h-3 w-3" />
          Add Status field
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/60 mb-3">
        <Columns className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-[14px] font-medium">Choose a field to group by</h3>
      <p className="mt-1 text-[13px] text-muted-foreground max-w-sm">
        Pick a select field to create columns for the board.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {selectFields.map((f) => (
          <Button
            key={f.field_key}
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onConfigure(f.field_key)}
          >
            {f.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function CalendarConfigPrompt({
  fields,
  onConfigure,
  onAddField,
}: {
  fields: CollectionField[];
  onConfigure: (fieldKey: string) => void;
  onAddField: (input: { field_key: string; field_type: CollectionFieldType; label: string }) => void;
}) {
  const dateFields = fields.filter(
    (f) => (f.field_type === "date" || f.field_type === "datetime") && f.is_active,
  );

  if (dateFields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/60 mb-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="text-[14px] font-medium">Calendar view needs a date field</h3>
        <p className="mt-1 text-[13px] text-muted-foreground max-w-sm">
          Add a date field to place records on the calendar.
        </p>
        <Button
          size="sm"
          className="mt-4 h-8 gap-1.5 text-xs"
          onClick={() =>
            onAddField({
              field_key: "due_date",
              field_type: "date",
              label: "Due Date",
            })
          }
        >
          <Plus className="h-3 w-3" />
          Add Due Date field
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/60 mb-3">
        <Calendar className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-[14px] font-medium">Choose a date field</h3>
      <p className="mt-1 text-[13px] text-muted-foreground max-w-sm">
        Pick which date field to display records on the calendar.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {dateFields.map((f) => (
          <Button
            key={f.field_key}
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onConfigure(f.field_key)}
          >
            {f.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default function CollectionSlugPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="table" count={8} />}>
      <CollectionDetailContent />
    </Suspense>
  );
}
