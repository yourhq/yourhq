"use client";

import { useCallback, useState } from "react";
import { Plus, Lock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useRealtime } from "@/hooks/use-realtime";
import { SecretRow } from "./secret-row";
import { AddSecretDialog } from "./add-secret-dialog";
import { EditSecretDialog } from "./edit-secret-dialog";
import {
  listSecretsForGateway,
  deleteSecret,
} from "@/app/dashboard/settings/secrets/actions";
import type { Secret } from "@/lib/secrets/types";
import type { Gateway } from "@/lib/gateways/types";

interface SecretsSettingsProps {
  initialGateways: Gateway[];
  initialGatewayId: string | null;
  initialSecrets: Secret[];
}

export function SecretsSettings({
  initialGateways,
  initialGatewayId,
  initialSecrets,
}: SecretsSettingsProps) {
  const [gateways] = useState<Gateway[]>(initialGateways);
  const [gatewayId, setGatewayId] = useState<string | null>(initialGatewayId);
  const [secrets, setSecrets] = useState<Secret[]>(initialSecrets);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Secret | null>(null);
  const [removing, setRemoving] = useState<Secret | null>(null);

  const refetch = useCallback(async (gid: string) => {
    const r = await listSecretsForGateway(gid);
    if (r.ok && r.data) setSecrets(r.data.secrets);
  }, []);

  const handleGatewayChange = useCallback(
    (gid: string) => {
      setGatewayId(gid);
      void refetch(gid);
    },
    [refetch],
  );

  useRealtime({
    table: "secrets",
    filter: gatewayId ? `gateway_id=eq.${gatewayId}` : undefined,
    onPayload: () => {
      if (gatewayId) void refetch(gatewayId);
    },
  });

  const handleRemove = useCallback(async () => {
    if (!removing) return;
    const r = await deleteSecret(removing.id);
    if (!r.ok) {
      toast.error(r.error ?? "Failed to remove secret");
      return;
    }
    toast.success("Secret removed");
    setRemoving(null);
    if (gatewayId) void refetch(gatewayId);
  }, [removing, gatewayId, refetch]);

  const gatewaySecrets = secrets.filter((s) => !s.agent_id);
  const agentSecrets = secrets.filter((s) => s.agent_id);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Lock className="h-4 w-4" />}
        title="Secrets"
        description="API keys and credentials your agents use to connect to external services. Encrypted at rest — values can never be viewed after saving."
        primaryAction={
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={!gatewayId}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add secret
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-5">
          {gateways.length === 0 ? (
            <EmptyState
              icon={Lock}
              title="No gateways yet"
              description="Add a gateway first — that's the machine where your agents (and their secrets) live."
              action={{
                label: "Go to Gateways",
                icon: Plus,
                onClick: () => {
                  window.location.href = "/dashboard/settings/gateways";
                },
              }}
            />
          ) : (
            <>
              {gateways.length > 1 && (
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span>Showing secrets on</span>
                    <Select
                      value={gatewayId ?? undefined}
                      onValueChange={handleGatewayChange}
                    >
                      <SelectTrigger className="h-7 w-[200px] text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {gateways.map((g) => (
                          <SelectItem key={g.id} value={g.id} className="text-[12px]">
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70">
                    Each gateway has its own secrets.
                  </p>
                </div>
              )}

              {secrets.length === 0 ? (
                <EmptyState
                  icon={Lock}
                  title="No secrets yet"
                  description="When your agents need API keys or credentials to connect to external services, add them here. Secrets are encrypted and never shared with the AI model."
                  action={{
                    label: "Add a secret",
                    icon: Plus,
                    onClick: () => setAddOpen(true),
                  }}
                  compact
                />
              ) : (
                <div className="space-y-4">
                  {gatewaySecrets.length > 0 && (
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                        Available to all agents
                      </p>
                      <div className="overflow-hidden rounded-md border border-border/60 bg-card">
                        {gatewaySecrets.map((s, idx) => (
                          <SecretRow
                            key={s.id}
                            secret={s}
                            isFirst={idx === 0}
                            onEdit={() => setEditing(s)}
                            onRemove={() => setRemoving(s)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {agentSecrets.length > 0 && (
                    <div>
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                        Agent-specific
                      </p>
                      <div className="overflow-hidden rounded-md border border-border/60 bg-card">
                        {agentSecrets.map((s, idx) => (
                          <SecretRow
                            key={s.id}
                            secret={s}
                            isFirst={idx === 0}
                            onEdit={() => setEditing(s)}
                            onRemove={() => setRemoving(s)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {gatewayId && (
        <AddSecretDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          gatewayId={gatewayId}
          onCreated={() => {
            if (gatewayId) void refetch(gatewayId);
          }}
        />
      )}

      {editing && (
        <EditSecretDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          secret={editing}
          onUpdated={() => {
            setEditing(null);
            if (gatewayId) void refetch(gatewayId);
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          open
          tone="destructive"
          onCancel={() => setRemoving(null)}
          title={`Remove ${removing.name}?`}
          description={
            <>
              The secret <span className="font-mono text-[12px]">{removing.key}</span>{" "}
              will be deleted from this gateway. Any agent tool that depends on it
              will stop working.
            </>
          }
          confirmLabel="Remove"
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
}
