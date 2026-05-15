"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSourceConnections } from "@/hooks/use-source-connections";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { ProviderPickerDialog } from "@/components/sources/provider-picker-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PROVIDER_LABELS,
  CONNECTION_STATUS_COLORS,
  CONNECTION_STATUS_LABELS,
} from "@/lib/sources/types";
import { PROVIDER_MANIFESTS } from "@/lib/sources/generated-manifests";
import { Globe, Plus, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface SourcesPageClientProps {
  isHosted: boolean;
}

function SourcesContent({
  isHosted,
}: SourcesPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sc = useSourceConnections();
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      toast.error(error);
      router.replace("/dashboard/settings/sources");
    }
  }, [searchParams, router]);

  if (sc.loading) {
    return (
      <>
        <PageHeader
          title="Sources"
          icon={<Globe className="h-4 w-4" />}
          description="Connect external services to sync content into Knowledge."
        />
        <div className="p-5">
          <LoadingSkeleton variant="list" count={3} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sources"
        icon={<Globe className="h-4 w-4" />}
        description="Connect external services to sync content into Knowledge."
        primaryAction={
          sc.connections.length > 0 ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setShowPicker(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Connect
            </Button>
          ) : undefined
        }
      />

      {sc.connections.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No sources connected"
          description="Connect Notion or Google Drive to sync content your agents can search and cite."
          action={{
            label: "Connect source",
            onClick: () => setShowPicker(true),
          }}
        />
      ) : (
        <div className="p-5 space-y-1">
          {sc.connections.map((conn) => {
            const lastRun = sc.syncRuns.find(
              (r) => r.connection_id === conn.id,
            );
            return (
              <button
                key={conn.id}
                type="button"
                onClick={() =>
                  router.push(`/dashboard/settings/sources/${conn.id}`)
                }
                className="group flex w-full items-center gap-3 rounded-lg border border-border/50 p-3 text-left transition-colors hover:bg-accent/50"
              >
                <ProviderMark provider={conn.provider} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-heading truncate">
                      {conn.account_label}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        CONNECTION_STATUS_COLORS[conn.status],
                      )}
                    >
                      {CONNECTION_STATUS_LABELS[conn.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                    <span>{PROVIDER_LABELS[conn.provider]}</span>
                    {conn.last_verified_at && (
                      <span>
                        Synced{" "}
                        {formatDistanceToNow(
                          new Date(conn.last_verified_at),
                          { addSuffix: true },
                        )}
                      </span>
                    )}
                    {lastRun && lastRun.items_synced > 0 && (
                      <span>{lastRun.items_synced} items</span>
                    )}
                  </div>
                  {conn.status !== "active" && conn.error_message && (
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-status-error">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="truncate">{conn.error_message}</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ProviderPickerDialog
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onCreated={(conn) => {
          setShowPicker(false);
          router.push(`/dashboard/settings/sources/${conn.id}`);
        }}
        createConnection={sc.actions.createConnection}
        isHosted={isHosted}
      />
    </>
  );
}

function ProviderMark({ provider }: { provider: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card text-[13px] font-semibold text-muted-foreground">
      {PROVIDER_MANIFESTS[provider]?.icon ?? "?"}
    </div>
  );
}

export function SourcesPageClient(props: SourcesPageClientProps) {
  return (
    <Suspense fallback={<LoadingSkeleton variant="list" count={3} />}>
      <SourcesContent {...props} />
    </Suspense>
  );
}
