"use client";

import { useCallback, useState } from "react";
import { Plus, Blocks } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PluginRow } from "./plugin-row";
import { AddWebhookPluginDialog } from "./add-webhook-plugin-dialog";
import { PluginDetailDialog } from "./plugin-detail-dialog";
import { usePlugins } from "@/hooks/use-plugins";
import type { HQPlugin } from "@/lib/plugins/types";

interface PluginsSettingsProps {
  initialPlugins: HQPlugin[];
}

export function PluginsSettings({ initialPlugins }: PluginsSettingsProps) {
  const { plugins, toggleEnabled, remove, refetch } =
    usePlugins(initialPlugins);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<HQPlugin | null>(null);
  const [removing, setRemoving] = useState<HQPlugin | null>(null);

  const handleToggle = useCallback(
    async (plugin: HQPlugin, enabled: boolean) => {
      const r = await toggleEnabled(plugin.id, enabled);
      if (!r.ok) toast.error(r.error ?? "Failed to update plugin");
    },
    [toggleEnabled],
  );

  const handleRemove = useCallback(async () => {
    if (!removing) return;
    const r = await remove(removing.id);
    if (!r.ok) {
      toast.error(r.error ?? "Failed to remove plugin");
      return;
    }
    toast.success("Plugin removed");
    setRemoving(null);
  }, [removing, remove]);

  const builtinPlugins = plugins.filter((p) => p.source === "builtin");
  const installedPlugins = plugins.filter((p) => p.source !== "builtin");

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Blocks className="h-4 w-4" />}
        title="Plugins"
        description="Extend HQ with webhook integrations and custom plugins that react to events across your workspace."
        primaryAction={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add plugin
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-5">
          {plugins.length === 0 ? (
            <EmptyState
              icon={Blocks}
              title="No plugins yet"
              description="Plugins let you react to HQ events — send Slack notifications when tasks complete, sync to Linear, trigger webhooks, and more."
              action={{
                label: "Add a plugin",
                icon: Plus,
                onClick: () => setAddOpen(true),
              }}
              compact
            />
          ) : (
            <div className="space-y-4">
              {builtinPlugins.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    Built-in
                  </p>
                  <div className="overflow-hidden rounded-md border border-border/60 bg-card">
                    {builtinPlugins.map((p, idx) => (
                      <PluginRow
                        key={p.id}
                        plugin={p}
                        isFirst={idx === 0}
                        onToggle={(enabled) => handleToggle(p, enabled)}
                        onRemove={() => setRemoving(p)}
                        onSelect={() => setSelected(p)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {installedPlugins.length > 0 && (
                <div>
                  {builtinPlugins.length > 0 && (
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      Installed
                    </p>
                  )}
                  <div className="overflow-hidden rounded-md border border-border/60 bg-card">
                    {installedPlugins.map((p, idx) => (
                      <PluginRow
                        key={p.id}
                        plugin={p}
                        isFirst={idx === 0}
                        onToggle={(enabled) => handleToggle(p, enabled)}
                        onRemove={() => setRemoving(p)}
                        onSelect={() => setSelected(p)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AddWebhookPluginDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={refetch}
      />

      <PluginDetailDialog
        plugin={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />

      {removing && (
        <ConfirmDialog
          open
          tone="destructive"
          onCancel={() => setRemoving(null)}
          title={`Remove ${removing.name}?`}
          description={
            <>
              The plugin{" "}
              <span className="font-mono text-[12px]">{removing.plugin_id}</span>{" "}
              will be removed and will no longer receive events.
            </>
          }
          confirmLabel="Remove"
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
}
