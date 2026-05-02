"use client";

import { Suspense } from "react";
import { useCollections } from "@/hooks/use-collections";
import { CollectionIndex } from "@/components/collections/collection-index";
import { CollectionCreateDialog } from "@/components/collections/collection-create-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Database, Plus, Archive } from "lucide-react";
import { useState } from "react";

function CollectionsContent() {
  const c = useCollections();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  if (c.loading) return <LoadingSkeleton variant="cards" count={6} />;

  return (
    <>
      <PageHeader
        title="Collections"
        icon={<Database className="h-5 w-5" />}
        primaryAction={
          <Button size="sm" className="gap-1.5" onClick={c.form.openCreate}>
            <Plus className="h-3.5 w-3.5" />
            New Collection
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={c.filters.search}
            onChange={(e) => c.filters.setSearch(e.target.value)}
            placeholder="Search collections..."
            className="h-8 pl-8 text-body"
          />
        </div>
        <Button
          variant={c.filters.showArchived ? "secondary" : "ghost"}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => c.filters.setShowArchived(!c.filters.showArchived)}
        >
          <Archive className="h-3 w-3" />
          Archived
        </Button>
      </div>

      {/* Content */}
      <div className="p-4">
        {c.collections.length === 0 ? (
          c.filters.search ? (
            <EmptyState
              icon={Database}
              title="No collections match"
              description="Try adjusting your search."
              variant="filtered"
              onClearFilters={() => c.filters.setSearch("")}
            />
          ) : (
            <EmptyState
              icon={Database}
              title="No collections yet"
              description="Collections are custom tables for tracking anything — job applications, inventory, content calendars, and more."
              action={{ label: "New Collection", onClick: c.form.openCreate }}
            />
          )
        ) : (
          <CollectionIndex
            collections={c.collections}
            onArchive={c.actions.archiveCollection}
            onRestore={c.actions.restoreCollection}
            onDelete={(id) => setDeleteId(id)}
          />
        )}
      </div>

      <CollectionCreateDialog
        open={c.form.showCreate}
        onClose={c.form.closeCreate}
        templates={c.templates}
        onCreateBlank={c.actions.createCollection}
        onInstallTemplate={c.actions.installTemplate}
      />

      <ConfirmDeleteDialog
        open={!!deleteId}
        title="Delete collection?"
        description="This will permanently delete the collection and all its records. This cannot be undone."
        onConfirm={async () => {
          if (deleteId) await c.actions.deleteCollection(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="cards" count={6} />}>
      <CollectionsContent />
    </Suspense>
  );
}
