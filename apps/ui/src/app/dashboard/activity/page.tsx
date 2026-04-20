"use client";

import { Suspense } from "react";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { useAuditLog } from "@/hooks/use-audit-log";
import { PageHeader } from "@/components/shared/page-header";
import { Activity } from "lucide-react";

function ActivityContent() {
  const audit = useAuditLog();

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Activity className="h-4 w-4" />}
        title="Activity"
        description="Everything that has happened across your workspace."
      />

      <div className="shrink-0 border-b border-border/60 px-5 py-3">
        <ActivityFilters filters={audit.filters} />
      </div>

      <div className="flex-1 overflow-auto p-5">
        <ActivityFeed
          entries={audit.entries}
          loading={audit.loading}
          hasMore={audit.hasMore}
          onLoadMore={audit.loadMore}
        />
      </div>
    </div>
  );
}

export default function ActivityPage() {
  return (
    <Suspense>
      <ActivityContent />
    </Suspense>
  );
}
