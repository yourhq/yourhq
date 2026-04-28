"use client";

// Settings → Gateways → [id]. Surfaces everything the user might want
// to know or change about a single gateway:
//
//   - Header: emoji/icon, label (inline-editable), slug, status pill,
//     last-seen timestamp.
//   - Reachable URLs: base, files-API, noVNC. Override the base URL
//     when the auto-detected one is wrong (custom reverse proxy, etc.).
//   - Networking: networking_mode, tailscale_ip, exit_node from meta.
//   - Version: which gateway image is running (meta.version).
//   - Recent commands: last N agent_commands targeted at this gateway.
//   - Danger zone: remove gateway.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pencil,
  Server,
  Trash2,
  AlertTriangle,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusDot } from "@/components/ui/status-dot";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRealtime } from "@/hooks/use-realtime";
import { useAgentCommands } from "@/hooks/use-agent-commands";
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
  isHeartbeatFresh,
  resolveBaseUrl,
  type Gateway,
  type GatewayStatus,
} from "@/lib/gateways/types";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<GatewayStatus, string> = {
  online: "rgb(34 197 94)",
  provisioning: "rgb(245 158 11)",
  offline: "rgb(115 115 115)",
  error: "rgb(239 68 68)",
  paused: "rgb(245 158 11)",
};

const STATUS_LABEL: Record<GatewayStatus, string> = {
  online: "Online",
  provisioning: "Provisioning",
  offline: "Offline",
  error: "Error",
  paused: "Paused",
};

export function GatewayDetail({
  initialGateway,
}: {
  initialGateway: Gateway;
}) {
  const [gateway, setGateway] = useState<Gateway>(initialGateway);
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

  const fresh = isHeartbeatFresh(gateway.last_seen_at);
  const stale = gateway.status === "online" && !fresh;
  const effectiveStatus: GatewayStatus = stale ? "offline" : gateway.status;
  const lastSeen = gateway.last_seen_at
    ? formatDistanceToNow(new Date(gateway.last_seen_at), { addSuffix: true })
    : "never";

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Server className="h-4 w-4" />}
        title={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/settings/gateways"
              className="inline-flex items-center gap-1 text-[12px] font-normal text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Gateways
            </Link>
            <span className="text-muted-foreground/50">/</span>
            <EditableLabel
              gatewayId={gateway.id}
              initial={gateway.label}
              onSaved={(label) => setGateway((g) => ({ ...g, label }))}
            />
          </div>
        }
        description={
          <div className="flex items-center gap-1.5 text-[11px]">
            <StatusDot
              color={STATUS_COLOR[effectiveStatus]}
              size="sm"
              pulse={effectiveStatus === "provisioning"}
            />
            <span>{STATUS_LABEL[effectiveStatus]}</span>
            <span>·</span>
            <span className="font-mono">{gateway.slug}</span>
            <span>·</span>
            <span>last seen {lastSeen}</span>
            {stale && (
              <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                <AlertTriangle className="h-2.5 w-2.5" />
                no heartbeat
              </span>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl space-y-6 p-5">
          <ReachableUrlsSection gateway={gateway} />
          <NetworkingSection gateway={gateway} />
          <CommandsSection gatewayId={gateway.id} />
          <DangerZone
            gateway={gateway}
            onRemoved={() => router.push("/dashboard/settings/gateways")}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Inline-editable label ────────────────────────────────────────────

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
        className="group inline-flex items-center gap-1.5 text-[14px] font-semibold text-foreground"
      >
        <span className="truncate">{initial}</span>
        <Pencil className="h-3 w-3 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
      </button>
    );
  }

  // Mount a separate child while editing — its `initial` becomes its
  // initial state and we don't have to sync. Closing the editor (save
  // or cancel) flips back to the read-only path above, which always
  // reflects the latest `initial` straight from props.
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
    setSaving(true);
    const r = await updateGatewayLabelAction(gatewayId, trimmed);
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error ?? "Failed to rename");
      onCancel();
      return;
    }
    onSaved(trimmed);
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") onCancel();
        }}
        className="h-7 w-[180px] rounded-sm border border-border/60 bg-background px-2 text-[14px] font-semibold outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        maxLength={80}
        disabled={saving}
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded p-0.5 hover:bg-accent/60"
        aria-label="Save"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="rounded p-0.5 hover:bg-accent/60"
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </span>
  );
}

// ─── Reachable URLs (with override) ───────────────────────────────────

function ReachableUrlsSection({ gateway }: { gateway: Gateway }) {
  const auto = gateway.meta.reachable_urls?.base ?? null;
  const override = gateway.meta.reachable_urls_override?.base ?? null;
  const effective = resolveBaseUrl(gateway.meta);
  const filesApi = gateway.meta.reachable_urls?.files_api ?? null;
  const novnc = gateway.meta.reachable_urls?.novnc ?? null;

  const [editing, setEditing] = useState(false);

  return (
    <Section title="Reachable URLs">
      <KvRow
        label="Base URL"
        value={
          editing ? (
            <OverrideEditor
              gatewayId={gateway.id}
              initial={override ?? ""}
              onDone={() => setEditing(false)}
            />
          ) : (
            <div className="flex items-center gap-2">
              <UrlBadge url={effective} />
              {override && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                  override
                </span>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                {override ? "Edit" : "Override"}
              </button>
            </div>
          )
        }
      />
      {auto && override && (
        <KvRow
          label="Auto-detected"
          value={
            <span className="font-mono text-[11px] text-muted-foreground">
              {auto}
            </span>
          }
        />
      )}
      {filesApi && <KvRow label="Files API" value={<UrlBadge url={filesApi} />} />}
      {novnc && <KvRow label="noVNC" value={<UrlBadge url={novnc} />} />}
      {!effective && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          The gateway hasn&apos;t reported its reachable URL yet. It writes
          this on each boot.
        </p>
      )}
    </Section>
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
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const r = await updateReachableUrlOverrideAction(
      gatewayId,
      value.trim() || null,
    );
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error ?? "Failed to save override");
      return;
    }
    toast.success(value.trim() ? "Override saved" : "Override cleared");
    onDone();
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="https://gateway.example.com"
        className="h-7 text-[12px]"
        disabled={saving}
        autoFocus
      />
      <Button size="sm" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone} disabled={saving}>
        Cancel
      </Button>
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
      className="inline-flex items-center gap-1 truncate font-mono text-[11px] text-foreground hover:underline"
    >
      <span className="truncate">{url}</span>
      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
    </a>
  );
}

// ─── Networking ───────────────────────────────────────────────────────

function NetworkingSection({ gateway }: { gateway: Gateway }) {
  const m = gateway.meta;
  if (!m.networking_mode && !m.tailscale_ip && !m.exit_node && !m.version) {
    return null;
  }
  return (
    <Section title="Networking & version">
      {m.networking_mode && (
        <KvRow
          label="Mode"
          value={
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              {m.networking_mode}
            </span>
          }
        />
      )}
      {m.tailscale_ip && (
        <KvRow
          label="Tailscale IP"
          value={<span className="font-mono text-[11px]">{m.tailscale_ip}</span>}
        />
      )}
      {m.exit_node && (
        <KvRow
          label="Exit node"
          value={<span className="font-mono text-[11px]">{m.exit_node}</span>}
        />
      )}
      {m.version && (
        <KvRow
          label="Image version"
          value={
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              {m.version}
            </span>
          }
        />
      )}
    </Section>
  );
}

// ─── Recent commands ──────────────────────────────────────────────────

function CommandsSection({ gatewayId }: { gatewayId: string }) {
  const { commands, loading } = useAgentCommands({ gatewayId });

  return (
    <Section title="Recent commands" tight>
      {loading && commands.length === 0 ? (
        <div className="px-3 py-3">
          <LoadingSkeleton variant="list" count={3} />
        </div>
      ) : commands.length === 0 ? (
        <div className="px-3 py-6">
          <EmptyState
            icon={Server}
            title="No commands yet"
            description="Commands targeted at this gateway show up here."
            compact
          />
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {commands.slice(0, 20).map((cmd) => (
            <CommandRow key={cmd.id} command={cmd} />
          ))}
        </div>
      )}
      {commands.length > 0 && (
        <div className="border-t border-border/50 px-3 py-1.5 text-right">
          <Link
            href={`/dashboard/settings/system?gateway=${gatewayId}`}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            See all in System →
          </Link>
        </div>
      )}
    </Section>
  );
}

function CommandRow({ command }: { command: AgentCommand }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = command.stdout || command.stderr || command.error_message;
  return (
    <div
      className={cn(command.status === "failed" && "bg-red-500/5")}
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

// ─── Danger zone ──────────────────────────────────────────────────────

function DangerZone({
  gateway,
  onRemoved,
}: {
  gateway: Gateway;
  onRemoved: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500/10">
          <Trash2 className="h-4 w-4 text-red-400" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-[13px] font-semibold">Remove gateway</div>
          <p className="text-[12px] text-muted-foreground">
            Removes this gateway from the registry. Agents bound to it will
            block creation and provisioning until you remove or reassign
            them.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setConfirmOpen(true)}
        >
          Remove
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this gateway?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the <span className="font-mono">{gateway.slug}</span>{" "}
              row. The container on the host machine keeps running until you
              stop it manually with <code>docker compose down</code>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setRemoving(true);
                const r = await removeGatewayAction(gateway.id);
                setRemoving(false);
                if (!r.ok) {
                  toast.error(r.error ?? "Failed to remove");
                  return;
                }
                toast.success("Gateway removed");
                onRemoved();
              }}
              disabled={removing}
            >
              {removing ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────

function Section({
  title,
  tight,
  children,
}: {
  title: string;
  tight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div
        className={cn(
          "overflow-hidden rounded-md border border-border/60 bg-card",
          !tight && "px-1 py-1",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function KvRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-2">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-right">{value}</div>
    </div>
  );
}
