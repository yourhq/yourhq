"use client";

// Settings → Gateways → [id]. Mirrors the AgentDetailTabs layout:
// sticky DetailHeader on top, tabs + rail below. Rail carries the
// scoreboard (status, properties, reachable URLs, version), tabs carry
// the deeper surfaces (overview + commands).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MoreHorizontal,
  Server,
  Terminal,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { EmptyState } from "@/components/shared/empty-state";
import { DetailHeader } from "@/components/shared/detail-header";
import { OpenDesktopModal } from "./open-desktop-modal";
import {
  DetailSidebar,
  DetailSidebarMobile,
  DetailSidebarSection,
  DetailSidebarPropertyGrid,
  DetailSidebarProperty,
} from "@/components/shared/detail-sidebar";
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
  const [desktopOpen, setDesktopOpen] = useState(false);
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
  const stale = gateway.status === "ready" && !fresh;
  const effectiveStatus: GatewayStatus = stale ? "error" : gateway.status;
  const status = GATEWAY_STATUS[effectiveStatus];

  return (
    <div className="flex h-full flex-col">
      <DetailHeader
        back={{ href: "/dashboard/settings/gateways", label: "Gateways" }}
        identityIcon={
          <div className="flex h-8 w-8 items-center justify-center rounded bg-muted/40 text-muted-foreground">
            <Server className="h-4 w-4" />
          </div>
        }
        identityTitle={
          <EditableLabel
            gatewayId={gateway.id}
            initial={gateway.label}
            onSaved={(label) => setGateway((g) => ({ ...g, label }))}
          />
        }
        identityMeta={
          <>
            <StatusDot
              color={status.color}
              size="sm"
              pulse={status.pulse}
            />
            <span>{status.label}</span>
            <span>·</span>
            <span className="font-mono">{gateway.slug}</span>
            {stale && (
              <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                <AlertTriangle className="h-2.5 w-2.5" />
                stale
              </span>
            )}
          </>
        }
        secondaryActions={
          <DetailSidebarMobile title={`${gateway.label} details`}>
            <GatewayRailContent
              gateway={gateway}
              onOpenDesktop={() => setDesktopOpen(true)}
            />
          </DetailSidebarMobile>
        }
        overflow={
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

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border/60 px-5">
              <TabsList variant="line" className="h-9">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="commands">Commands</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="min-h-0 flex-1 overflow-auto">
              <div className="mx-auto max-w-3xl space-y-6 px-5 py-5">
                <ReachableUrlsSection gateway={gateway} />
              </div>
            </TabsContent>

            <TabsContent
              value="commands"
              className="min-h-0 flex-1 overflow-auto"
            >
              <div className="mx-auto max-w-3xl px-5 py-5">
                <CommandsTabContent gatewayId={gateway.id} />
              </div>
            </TabsContent>
          </Tabs>
        </main>

        <DetailSidebar>
          <GatewayRailContent
            gateway={gateway}
            onOpenDesktop={() => setDesktopOpen(true)}
          />
        </DetailSidebar>
      </div>

      <OpenDesktopModal
        open={desktopOpen}
        onClose={() => setDesktopOpen(false)}
        novncUrl={resolveNovncUrl(gateway)}
        title={`Desktop · ${gateway.label}`}
      />

      {removing && (
        <ConfirmDialog
          open
          tone="destructive"
          title={`Remove ${gateway.label}?`}
          description={
            <>
              This removes the gateway from your list here. The actual
              software keeps running on the machine itself — to fully
              shut it down, log into that machine and run{" "}
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

// ─── Right rail content (shared by desktop + mobile) ─────────────────

function GatewayRailContent({
  gateway,
  onOpenDesktop,
}: {
  gateway: Gateway;
  onOpenDesktop: () => void;
}) {
  const fresh = isHeartbeatFresh(gateway.last_seen_at);
  const stale = gateway.status === "ready" && !fresh;
  const effectiveStatus: GatewayStatus = stale ? "error" : gateway.status;
  const status = GATEWAY_STATUS[effectiveStatus];
  const lastSeen = gateway.last_seen_at
    ? formatDistanceToNow(new Date(gateway.last_seen_at), { addSuffix: true })
    : "Never";
  const m = gateway.meta;
  const hasDesktop = Boolean(resolveNovncUrl(gateway));

  return (
    <>
      <DetailSidebarSection title="Status">
        <div className="flex items-center gap-2 text-[12px]">
          <StatusDot color={status.color} size="sm" pulse={status.pulse} />
          <span>{status.label}</span>
          <span className="text-muted-foreground/60">· {lastSeen}</span>
        </div>
      </DetailSidebarSection>

      <DetailSidebarSection title="Properties">
        <DetailSidebarPropertyGrid>
          <DetailSidebarProperty label="Slug">
            <span className="font-mono text-foreground/80">{gateway.slug}</span>
          </DetailSidebarProperty>
          {m.networking_mode && (
            <DetailSidebarProperty label="Network">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {m.networking_mode}
              </span>
            </DetailSidebarProperty>
          )}
          {m.tailscale_ip && (
            <DetailSidebarProperty label="Tailscale">
              <span className="font-mono text-foreground/80">
                {m.tailscale_ip}
              </span>
            </DetailSidebarProperty>
          )}
          {m.exit_node && (
            <DetailSidebarProperty label="Exit node">
              <span className="font-mono text-foreground/80">{m.exit_node}</span>
            </DetailSidebarProperty>
          )}
          {m.version && (
            <DetailSidebarProperty label="Version">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {m.version}
              </span>
            </DetailSidebarProperty>
          )}
        </DetailSidebarPropertyGrid>
      </DetailSidebarSection>

      <DetailSidebarSection title="Quick actions">
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 justify-start text-[12px]"
            onClick={onOpenDesktop}
            disabled={!hasDesktop}
            title={
              hasDesktop
                ? "See what the agents are doing — Chrome, terminal, anything else they have open"
                : "Waiting for this gateway to come online before you can view its desktop"
            }
          >
            <Terminal className="mr-1.5 h-3 w-3" />
            Open desktop
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">
          Opens a live view of this machine&apos;s screen — the same
          Chrome window your agents are working in.
        </p>
      </DetailSidebarSection>
    </>
  );
}

// ─── Reachable URLs (Overview tab) ──────────────────────────────────

function ReachableUrlsSection({ gateway }: { gateway: Gateway }) {
  const auto = gateway.meta.reachable_urls?.base ?? null;
  const override = gateway.meta.reachable_urls_override?.base ?? null;
  const effective = resolveBaseUrl(gateway.meta);
  const filesApi = gateway.meta.reachable_urls?.files_api ?? null;
  const novnc = gateway.meta.reachable_urls?.novnc ?? null;

  const [editing, setEditing] = useState(false);

  return (
    <div>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Reachable URLs
      </h2>
      <p className="mb-3 text-[11px] text-muted-foreground/80">
        Where this UI talks to the gateway. The base URL is the address
        of the machine itself; the others are the specific services
        running on it (file browser, remote desktop). They&apos;re
        usually right out of the box — only override if you&apos;ve put
        the gateway behind a custom domain or proxy.
      </p>
      {!auto && !override && !filesApi && !novnc ? (
        <p className="text-xs text-muted-foreground">
          This gateway hasn&apos;t reported its address yet. It&apos;ll
          publish them on first boot — usually within a minute.
        </p>
      ) : (
        <div className="grid grid-cols-[120px_1fr] gap-x-6 gap-y-1.5 text-xs">
          <span className="py-0.5 text-muted-foreground">Base URL</span>
          <span className="min-w-0 py-0.5">
            {editing ? (
              <OverrideEditor
                gatewayId={gateway.id}
                initial={override ?? ""}
                onDone={() => setEditing(false)}
              />
            ) : (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
              </span>
            )}
          </span>
          {filesApi && (
            <>
              <span className="py-0.5 text-muted-foreground">Files API</span>
              <span className="min-w-0 py-0.5">
                <UrlBadge url={filesApi} />
              </span>
            </>
          )}
          {novnc && (
            <>
              <span className="py-0.5 text-muted-foreground">noVNC</span>
              <span className="min-w-0 py-0.5">
                <UrlBadge url={novnc} />
              </span>
            </>
          )}
        </div>
      )}
    </div>
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

// ─── Commands tab content ────────────────────────────────────────────

function CommandsTabContent({ gatewayId }: { gatewayId: string }) {
  const { commands, loading, hasMore, loadMore } = useAgentCommands({
    gatewayId,
  });

  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Recent commands
      </h2>
      {loading && commands.length === 0 ? (
        <LoadingSkeleton variant="list" count={3} />
      ) : commands.length === 0 ? (
        <EmptyState
          icon={Terminal}
          title="No commands yet"
          description="Commands targeted at this gateway will appear here."
          compact
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-border/60 bg-card">
          {commands.map((cmd, idx) => (
            <CommandRow key={cmd.id} command={cmd} isFirst={idx === 0} />
          ))}
        </div>
      )}
      {hasMore && (
        <div className="mt-2 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
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

// ─── Inline-editable label ───────────────────────────────────────────

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

// ─── Tag + InlineAlert helpers ──────────────────────────────────────

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

// Resolve the gateway's noVNC URL, applying the user's base-URL
// override if set. Mirrors the server-side
// getGatewayDesktopUrlAction so client + server agree.
function resolveNovncUrl(gateway: Gateway): string | null {
  const novnc = gateway.meta.reachable_urls?.novnc ?? null;
  if (!novnc) return null;
  const overrideBase = gateway.meta.reachable_urls_override?.base?.trim();
  if (!overrideBase) return novnc;
  try {
    const u = new URL(novnc);
    const o = new URL(overrideBase);
    u.protocol = o.protocol;
    u.hostname = o.hostname;
    if (o.port) u.port = o.port;
    return u.toString();
  } catch {
    return novnc;
  }
}

