"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CollectionDefinition } from "@/lib/collections/types";
import { CollectionRecordDetail } from "@/components/collections/collection-record-detail";
import { useCollectionRecords } from "@/hooks/use-collection-records";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EntityLinkList } from "@/components/shared/entity-link-list";
import { Archive, ArrowLeft, Database, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";

function RecordDetailContent() {
  const params = useParams<{ slug: string; id: string }>();
  const router = useRouter();
  const [collection, setCollection] = useState<CollectionDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("collection_definitions")
      .select("*")
      .eq("slug", params.slug)
      .single()
      .then(({ data }) => {
        setCollection(data);
        setLoading(false);
      });
  }, [params.slug]);

  if (loading) return <LoadingSkeleton variant="detail" />;
  if (!collection) {
    return (
      <EmptyState
        icon={Database}
        title="Collection not found"
        description="This collection doesn't exist."
        action={{ label: "Back", onClick: () => router.push("/dashboard/collections") }}
      />
    );
  }

  return <RecordDetailInner collection={collection} recordId={params.id} />;
}

function RecordDetailInner({
  collection,
  recordId,
}: {
  collection: CollectionDefinition;
  recordId: string;
}) {
  const router = useRouter();
  const cr = useCollectionRecords(collection.id);
  const [showDelete, setShowDelete] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  const record = useMemo(
    () => cr.allRecords.find((r) => r.id === recordId),
    [cr.allRecords, recordId],
  );

  const titleField = cr.titleField;
  const title = record && titleField
    ? (record.values[titleField.field_key] as string) || "Untitled"
    : "Untitled";

  if (cr.loading) return <LoadingSkeleton variant="detail" />;

  if (!record) {
    return (
      <EmptyState
        icon={Database}
        title="Record not found"
        description="This record doesn't exist or has been deleted."
        action={{
          label: "Back to collection",
          onClick: () => router.push(`/dashboard/collections/${collection.slug}`),
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/collections/${collection.slug}`}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="text-muted-foreground">{collection.name}</span>
            <span>/</span>
            {title}
          </div>
        }
        primaryAction={
          <div className="flex items-center gap-1.5">
            {record.archived_at ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => cr.actions.restoreRecord(recordId)}
              >
                <RotateCcw className="h-3 w-3" />
                Restore
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setShowArchive(true)}
              >
                <Archive className="h-3 w-3" />
                Archive
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="p-4 max-w-2xl">
        <CollectionRecordDetail
          record={record}
          fields={cr.fields}
          onCellChange={(fieldKey, value) => cr.actions.updateCell(recordId, fieldKey, value)}
          onAddField={cr.actions.addField}
          onNavigateToFields={() => router.push(`/dashboard/collections/${collection.slug}`)}
        />

        <div className="my-6 border-t border-border/30" />

        <EntityLinkList ownerType="collection_record" ownerId={recordId} />
      </div>

      <ConfirmDialog
        open={showArchive}
        title="Archive record?"
        description="This record will be hidden from default views. You can restore it later."
        confirmLabel="Archive"
        tone="warning"
        onConfirm={async () => {
          await cr.actions.archiveRecord(recordId);
          setShowArchive(false);
        }}
        onCancel={() => setShowArchive(false)}
      />

      <ConfirmDeleteDialog
        open={showDelete}
        title="Delete record?"
        description="This will permanently delete this record."
        onConfirm={async () => {
          await cr.actions.deleteRecord(recordId);
          router.push(`/dashboard/collections/${collection.slug}`);
        }}
        onCancel={() => setShowDelete(false)}
      />
    </>
  );
}

export default function CollectionRecordPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="detail" />}>
      <RecordDetailContent />
    </Suspense>
  );
}
