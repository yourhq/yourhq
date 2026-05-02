"use client";

import { Suspense } from "react";
import { useSourceConnections } from "@/hooks/use-source-connections";
import { SourceConnectionsPanel } from "@/components/sources/source-connections-panel";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { BookOpen } from "lucide-react";

function SourcesContent() {
  const sc = useSourceConnections();

  if (sc.loading) return <LoadingSkeleton variant="list" count={3} />;

  return (
    <>
      <PageHeader
        title="Knowledge Sources"
        icon={<BookOpen className="h-5 w-5" />}
        description="Connect external services to sync content into Knowledge."
      />
      <div className="p-4 max-w-2xl mx-auto">
        <SourceConnectionsPanel
          connections={sc.connections}
          syncRuns={sc.syncRuns}
          onCreateConnection={sc.actions.createConnection}
          onDeleteConnection={sc.actions.deleteConnection}
          onTriggerSync={sc.actions.triggerSync}
        />
      </div>
    </>
  );
}

export default function SourcesSettingsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="list" count={3} />}>
      <SourcesContent />
    </Suspense>
  );
}
