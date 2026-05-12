"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useRealtime } from "@/hooks/use-realtime";
import { SecretRow } from "@/components/secrets/secret-row";
import { AddSecretDialog } from "@/components/secrets/add-secret-dialog";
import { EditSecretDialog } from "@/components/secrets/edit-secret-dialog";
import {
  listSecretsForAgent,
  deleteSecret,
} from "@/app/dashboard/settings/secrets/actions";
import type { AgentSecretView } from "@/lib/secrets/types";

interface AgentSecretsTabProps {
  agentId: string;
  agentName: string;
  gatewayId: string | null;
}

export function AgentSecretsTab({
  agentId,
  agentName,
  gatewayId,
}: AgentSecretsTabProps) {
  const [secrets, setSecrets] = useState<AgentSecretView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<AgentSecretView | null>(null);
  const [removing, setRemoving] = useState<AgentSecretView | null>(null);

  const refetch = useCallback(async () => {
    if (!gatewayId) return;
    const r = await listSecretsForAgent(agentId, gatewayId);
    if (r.ok && r.data) {
      setSecrets(r.data.secrets);
      setLoaded(true);
    }
  }, [agentId, gatewayId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [refetch]);

  useRealtime({
    table: "secrets",
    filter: gatewayId ? `gateway_id=eq.${gatewayId}` : undefined,
    onPayload: () => void refetch(),
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
    void refetch();
  }, [removing, refetch]);

  if (!gatewayId) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-5">
        <EmptyState
          icon={Lock}
          title="No gateway assigned"
          description="This agent needs a gateway before secrets can be configured."
          compact
        />
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-5">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const agentSecrets = secrets.filter((s) => s.scope === "agent");
  const gatewaySecrets = secrets.filter((s) => s.scope === "gateway");

  return (
    <div className="mx-auto max-w-3xl px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          Credentials and keys this agent can use.
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add secret
        </Button>
      </div>

      {secrets.length === 0 ? (
        <EmptyState
          icon={Lock}
          title="No secrets yet"
          description="When this agent's tools need API keys or credentials, add them here. Secrets are encrypted and never shared with the AI model — only the tools it runs can read them."
          action={{
            label: "Add a secret",
            icon: Plus,
            onClick: () => setAddOpen(true),
          }}
          compact
        />
      ) : (
        <div className="space-y-4">
          {agentSecrets.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Only for this agent
              </p>
              <div className="overflow-hidden rounded-md border border-border/60 bg-card">
                {agentSecrets.map((s, idx) => (
                  <SecretRow
                    key={s.id}
                    secret={s}
                    isFirst={idx === 0}
                    onEdit={() => setEditing(s)}
                    onRemove={() => setRemoving(s)}
                    scopeLabel={`Only for ${agentName}`}
                  />
                ))}
              </div>
            </div>
          )}

          {gatewaySecrets.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  Shared from Settings
                </p>
                <Link
                  href="/dashboard/settings/secrets"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Manage
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <p className="mb-2 text-[11px] text-muted-foreground/70">
                Available to all agents. Override any of these for this agent only.
              </p>
              <div className="overflow-hidden rounded-md border border-border/60 bg-card">
                {gatewaySecrets.map((s, idx) => (
                  <SecretRow
                    key={s.id}
                    secret={s}
                    isFirst={idx === 0}
                    onEdit={() => setEditing(s)}
                    onRemove={() => setRemoving(s)}
                    scopeLabel="All agents"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <AddSecretDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        gatewayId={gatewayId}
        agentId={agentId}
        agentName={agentName}
        onCreated={() => void refetch()}
      />

      {editing && (
        <EditSecretDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          secret={editing}
          onUpdated={() => {
            setEditing(null);
            void refetch();
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
            removing.scope === "agent" ? (
              <>
                The secret{" "}
                <span className="font-mono text-[12px]">{removing.key}</span>{" "}
                will be deleted. If a shared version exists, this agent will fall
                back to that.
              </>
            ) : (
              <>
                This will remove the shared secret{" "}
                <span className="font-mono text-[12px]">{removing.key}</span>{" "}
                for all agents on this gateway.
              </>
            )
          }
          confirmLabel="Remove"
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
}
