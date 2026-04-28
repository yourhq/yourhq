"use client";

// Settings → Gateways → [id]. Mirrors the property layout used on agent
// detail pages: grid-cols-[auto_1fr] of sentence-case labels +
// values, with section dividers via border-t.
//
// Editable affordances:
//   - Title (label) — click-to-edit, inherits the agent inline-edit
//     pattern but rendered as a hover-tinted button so the affordance
//     doesn't depend on a hover-revealed pencil.
//   - Base URL override — click "Override" to swap the row into an
//     editor; saves to meta.reachable_urls_override.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MoreHorizontal,
  Server,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PageHeader, PageSection } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { useRealtime } from "@/hooks/use-realtime";
import { useAgentCommands } from "@/hooks/use-agent-commands";
import { StatusDot } from "@/components/ui/status-dot";
import {
  COMMAND_ACTION_LABELS,
  COMMAND_STATUS_COLORS,
  type AgentCommand,
} from "@/lib/agents/types";
import {
  getGatewayAction,
  removeGatewayAction,
  updateGatewayLabelAction,
  updateReachableUrlOverrideAction,
} from "@/app/dashboard/settings/gateways/actions";
import {
  GATEWAY_STATUS,
  isHeartbeatFresh,
  resolveBaseUrl,
  type Gateway,
  type GatewayStatus,
} from "@/lib/gateways/types";
import { cn } from "@/lib/utils";

export function GatewayDetail({
  initialGateway,
}: {
  initialGateway: Gateway;
}) {
  const [gateway, setGateway] = useState<Gateway>(initialGateway);
  const [removing, setRemoving] = useState(false);
  const router = useRouter();

  const refetch = useMemo(
    () => async () => {
      const r = await getGatewayAction(gateway.id);
      if (r.ok && r.data) setGateway(r.data);
    },
    [gateway.id],
  );

  useRealtime({
    table: "gateways",
    filter: `id=eq.${gateway.id}`,
    onPayload: () => void refetch(),
  });

  // Tick "last seen" labels.
  const [, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Server className="h-4 w-4" />}
        title={
          <EditableLabel
            gatewayId={gateway.id}
            initial={gateway.label}
            onSaved={(label) => setGateway((g) => ({ ...g, label }))}
          />
        }
        description={
          <Link
            href="/dashboard/settings/gateways"
            className="text-muted-foreground hover:text-foreground"
          >
            Gateways
          </Link>
        }
        secondaryActions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Gateway actions">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setRemoving(true);
                }}
                className="gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove gateway
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl">
          <OverviewSection gateway={gateway} />
          <ReachableUrlsSection gateway={gateway} />
          <CommandsSection gatewayId={gateway.id} />
        </div>
      </div>

      {removing && (
        <ConfirmDialog
          open
          tone="destructive"
          title={`Remove ${gateway.label}?`}
          description={
            <>
              This removes the <span className="font-mono">{gateway.slug}</span>{" "}
              row from the registry. The container on the host keeps running
              until you stop it manually with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                docker compose down
              </code>
              .
            </>
          }
          confirmLabel="Remove"
          onCancel={() => setRemoving(false)}
          onConfirm={async () => {
            const r = await removeGatewayAction(gateway.id);
            if (!r.ok) {
              toast.error(r.error ?? "Failed to remove gateway");
              return;
            }
            toast.success("Gateway removed");
            router.push("/dashboard/settings/gateways");
          }}
        />
      )}
    </div>
  );
}

// ─── Overview (status, slug, networking, version) ────────────────────

function OverviewSection({ gateway }: { gateway: Gateway }) {
  const fresh = isHeartbeatFresh(gateway.last_seen_at);
  const stale = gateway.status === "online" && !fresh;
  const effectiveStatus: GatewayStatus = stale ? "offline" : gateway.status;
  const status = GATEWAY_STATUS[effectiveStatus];

  const lastSeen = gateway.last_seen_at
    ? formatDistanceToNow(new Date(gateway.last_seen_at), { addSuffix: true })
    : "Never";

  const m = gateway.meta;

  return (
    <PageSection title="Overview">
      <PropertyGrid>
        <PropertyRow label="Status">
          <span className="inline-flex items-center gap-1.5">
            <StatusDot color={status.color} size="sm" pulse={status.pulse} />
            <span>{status.label}</span>
            {stale && (
              <span
                title="No recent heartbeat"
                className="ml-1 inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                stale
              </span>
            )}
          </span>
        </PropertyRow>
        <PropertyRow label="Slug">
          <span className="font-mono text-foreground/80">{gateway.slug}</span>
        </PropertyRow>
        <PropertyRow label="Last seen">{lastSeen}</PropertyRow>
        {m.networking_mode && (
          <PropertyRow label="Networking">
            <Tag>{m.networking_mode}</Tag>
          </PropertyRow>
        )}
        {m.tailscale_ip && (
          <PropertyRow label="Tailscale IP">
            <span className="font-mono text-foreground/80">{m.tailscale_ip}</span>
          </PropertyRow>
        )}
        {m.exit_node && (
          <PropertyRow label="Exit node">
            <span className="font-mono text-foreground/80">{m.exit_node}</span>
          </PropertyRow>
        )}
        {m.version && (
          <PropertyRow label="Version">
            <Tag>{m.version}</Tag>
          </PropertyRow>
        )}
      </PropertyGrid>
    </PageSection>
  );
}

// ─── Reachable URLs (with override) ──────────────────────────────────

function ReachableUrlsSection({ gateway }: { gateway: Gateway }) {
  const auto = gateway.meta.reachable_urls?.base ?? null;
  const override = gateway.meta.reachable_urls_override?.base ?? null;
  const effective = resolveBaseUrl(gateway.meta);
  const filesApi = gateway.meta.reachable_urls?.files_api ?? null;
  const novnc = gateway.meta.reachable_urls?.novnc ?? null;

  const [editing, setEditing] = useState(false);

  if (!auto && !override && !filesApi && !novnc) {
    return (
      <PageSection
        title="Reachable URLs"
        description="The gateway hasn't reported any URLs yet. They're written on each boot."
        className="border-t border-border/50"
      >
        <div />
      </PageSection>
    );
  }

  return (
    <PageSection title="Reachable URLs" className="border-t border-border/50">
      <PropertyGrid>
        <PropertyRow label="Base URL">
          {editing ? (
            <OverrideEditor
              gatewayId={gateway.id}
              initial={override ?? ""}
              onDone={() => setEditing(false)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <UrlBadge url={effective} />
              {override && <Tag tone="warning">override</Tag>}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                {override ? "Edit" : "Override"}
              </button>
              {auto && override && (
                <span className="text-[11px] text-muted-foreground/60">
                  · auto: <span className="font-mono">{auto}</span>
                </span>
              )}
            </div>
          )}
        </PropertyRow>
        {filesApi && (
          <PropertyRow label="Files API">
            <UrlBadge url={filesApi} />
          </PropertyRow>
        )}
        {novnc && (
          <PropertyRow label="noVNC">
            <UrlBadge url={novnc} />
          </PropertyRow>
        )}
      </PropertyGrid>
    </PageSection>
  );
}

function OverrideEditor({
  gatewayId,
  initial,
  onDone,
}: {
  gatewayId: string;
  initial: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    setSaving(true);
    const r = await updateReachableUrlOverrideAction(
      gatewayId,
      value.trim() || null,
    );
    setSaving(false);
    if (!r.ok) {
      setError(r.error ?? "Failed to save override");
      return;
    }
    onDone();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://gateway.example.com"
          className="h-7 max-w-[320px] font-mono text-[12px]"
          disabled={saving}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") onDone();
          }}
        />
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
      </div>
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}

function UrlBadge({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-[300px] items-center gap-1 truncate font-mono text-[12px] text-foreground hover:underline"
    >
      <span className="truncate">{url}</span>
      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
    </a>
  );
}

// ─── Recent commands ─────────────────────────────────────────────────

function CommandsSection({ gatewayId }: { gatewayId: string }) {
  const { commands, loading } = useAgentCommands({ gatewayId });

  return (
    <PageSection
      title="Recent commands"
      action={
        commands.length > 0 ? (
          <Link
            href={`/dashboard/settings/system?gateway=${gatewayId}`}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            See all →
          </Link>
        ) : null
      }
      className="border-t border-border/50"
    >
      {loading && commands.length === 0 ? (
        <LoadingSkeleton variant="list" count={3} />
      ) : commands.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Commands targeted at this gateway will appear here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border/60 bg-card">
          {commands.slice(0, 20).map((cmd, idx) => (
            <CommandRow key={cmd.id} command={cmd} isFirst={idx === 0} />
          ))}
        </div>
      )}
    </PageSection>
  );
}

function CommandRow({
  command,
  isFirst,
}: {
  command: AgentCommand;
  isFirst: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = command.stdout || command.stderr || command.error_message;

  return (
    <div
      className={cn(
        !isFirst && "border-t border-border/50",
        command.status === "failed" && "bg-red-500/5",
      )}
    >
      <button
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/30"
        onClick={() => hasOutput && setExpanded(!expanded)}
      >
        {hasOutput ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <StatusDot color={COMMAND_STATUS_COLORS[command.status]} size="sm" />
        <span className="shrink-0 text-xs font-medium">
          {COMMAND_ACTION_LABELS[command.action]}
        </span>
        {command.agent_slug && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {command.agent_slug}
          </span>
        )}
        <span className="flex-1 truncate text-xs text-muted-foreground">
          {command.status === "running" && "Running…"}
          {command.status === "leased" && "Claimed…"}
          {command.status === "pending" && "Queued"}
          {command.status === "done" &&
            (command.exit_code !== null ? `exit ${command.exit_code}` : "Done")}
          {command.status === "failed" && (command.error_message || "Failed")}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/60">
          {formatDistanceToNow(new Date(command.created_at), {
            addSuffix: true,
          })}
        </span>
      </button>
      {expanded && hasOutput && (
        <div className="space-y-2 px-4 pb-3 pt-1">
          {command.stdout && (
            <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2.5 text-[10px] text-muted-foreground">
              {command.stdout}
            </pre>
          )}
          {command.stderr && (
            <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-red-500/10 p-2.5 text-[10px] text-red-300/80">
              {command.stderr}
            </pre>
          )}
          {command.error_message && !command.stderr && (
            <pre className="max-h-32 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-red-500/10 p-2.5 text-[10px] text-red-300/80">
              {command.error_message}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inline-editable label (PageHeader title) ────────────────────────

function EditableLabel({
  gatewayId,
  initial,
  onSaved,
}: {
  gatewayId: string;
  initial: string;
  onSaved: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="-mx-1 truncate rounded px-1 transition-colors hover:bg-muted/40"
      >
        {initial}
      </button>
    );
  }

  return (
    <EditableLabelInput
      gatewayId={gatewayId}
      initial={initial}
      onSaved={(label) => {
        onSaved(label);
        setEditing(false);
      }}
      onCancel={() => setEditing(false)}
    />
  );
}

function EditableLabelInput({
  gatewayId,
  initial,
  onSaved,
  onCancel,
}: {
  gatewayId: string;
  initial: string;
  onSaved: (label: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initial) {
      onCancel();
      return;
    }
    setError(null);
    setSaving(true);
    const r = await updateGatewayLabelAction(gatewayId, trimmed);
    setSaving(false);
    if (!r.ok) {
      setError(r.error ?? "Failed to rename");
      return;
    }
    onSaved(trimmed);
  };

  return (
    <span className="flex flex-col gap-1">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => {
          if (!saving) void save();
        }}
        className="-mx-1 max-w-[280px] rounded border border-border/60 bg-background px-1 outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
        maxLength={80}
        disabled={saving}
      />
      {error && <InlineAlert>{error}</InlineAlert>}
    </span>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────

function PropertyGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid max-w-full grid-cols-[120px_1fr] gap-x-6 gap-y-1.5 text-xs">
      {children}
    </div>
  );
}

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <span className="py-0.5 text-muted-foreground">{label}</span>
      <span className="min-w-0 py-0.5">{children}</span>
    </>
  );
}

function Tag({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warning";
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[10px]",
        tone === "warning"
          ? "bg-amber-500/10 text-amber-300"
          : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function InlineAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[12px]">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
      <span className="min-w-0 text-destructive">{children}</span>
    </div>
  );
}
