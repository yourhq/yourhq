"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Globe, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  saveOrigins,
  refreshTailscaleStatus,
} from "@/app/dashboard/settings/networking/actions";
import type { UiOrigin } from "@/lib/workspaces/schema";

export interface NetworkingStatus {
  installed: boolean;
  loggedIn: boolean;
  selfIp?: string;
  magicDnsName?: string;
  selfHostname?: string;
  error?: string;
}

export function NetworkingSettings({
  initialStatus,
  workspaceOrigins,
  workspaceId,
}: {
  initialStatus: NetworkingStatus;
  workspaceOrigins: UiOrigin[];
  workspaceId: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [origins, setOrigins] = useState<UiOrigin[]>(workspaceOrigins);
  const [pending, startTransition] = useTransition();
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [saved, setSaved] = useState(false);

  const refresh = () => {
    startTransition(async () => {
      const s = await refreshTailscaleStatus();
      setStatus(s);
    });
  };

  const save = () => {
    if (!workspaceId) return;
    startTransition(async () => {
      const r = await saveOrigins({ projectId: workspaceId, origins });
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  };

  const addTailnetOrigin = () => {
    if (!status.magicDnsName) return;
    const url = `http://${status.magicDnsName}:3000`;
    if (origins.some((o) => o.url === url)) return;
    setOrigins([...origins, { url, label: "Tailnet", kind: "tailnet" }]);
  };

  const addCustom = () => {
    if (!newUrl.trim()) return;
    setOrigins([
      ...origins,
      {
        url: newUrl.trim(),
        label: newLabel.trim() || undefined,
        kind: "custom",
      },
    ]);
    setNewUrl("");
    setNewLabel("");
  };

  const remove = (url: string) =>
    setOrigins(origins.filter((o) => o.url !== url));

  return (
    <div className="space-y-6">
      {/* Tailscale block */}
      <section className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-status-info/10 text-status-info">
            <Globe className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-[13px] font-semibold">Tailscale</div>
            <div className="text-[11px] text-muted-foreground">
              Reach HQ from any device on your tailnet.
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] hover:bg-accent/60"
          >
            <RefreshCw className={cn("h-3 w-3", pending && "animate-spin")} />
            Refresh
          </button>
        </div>

        {!status.installed && (
          <div className="rounded-md border border-dashed border-border/60 p-3 text-[12px]">
            <p className="text-muted-foreground">
              Tailscale isn&apos;t installed on this host. Install it from{" "}
              <a
                href="https://tailscale.com/download"
                target="_blank"
                rel="noreferrer"
                className="text-foreground hover:underline"
              >
                tailscale.com/download
              </a>
              , sign in, then click Refresh above.
            </p>
          </div>
        )}

        {status.installed && !status.loggedIn && (
          <div className="rounded-md border border-status-warning/40 bg-status-warning/5 p-3 text-[12px]">
            <p>
              Tailscale is installed but not signed in. Run{" "}
              <span className="font-mono">sudo tailscale up</span> or open the
              Tailscale app.
            </p>
          </div>
        )}

        {status.installed && status.loggedIn && (
          <div className="space-y-2 rounded-md border border-status-success/40 bg-status-success/5 p-3">
            <div className="flex items-start gap-2 text-[12px]">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-success" />
              <div className="space-y-0.5">
                <div className="font-medium">Connected</div>
                <div className="text-muted-foreground">
                  <span className="font-mono">
                    {status.magicDnsName ?? status.selfHostname}
                  </span>
                  {status.selfIp && (
                    <>
                      {" "}• <span className="font-mono">{status.selfIp}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {status.magicDnsName && (
              <button
                type="button"
                onClick={addTailnetOrigin}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] hover:bg-accent/60"
              >
                <Plus className="h-3 w-3" />
                Add tailnet URL as an origin
              </button>
            )}
          </div>
        )}
      </section>

      {/* Origins list */}
      <section className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
        <div>
          <div className="text-[13px] font-semibold">Allowed origins</div>
          <div className="text-[11px] text-muted-foreground">
            Addresses the UI will accept requests from. Localhost is always
            allowed. Add others when you expose HQ over a tailnet, custom
            domain, or reverse proxy.
          </div>
        </div>

        <div className="space-y-1.5">
          {origins.length === 0 && (
            <div className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
              No extra origins — HQ is reachable at localhost:3000 only.
            </div>
          )}

          {origins.map((o) => (
            <div
              key={o.url}
              className="flex items-center gap-3 rounded-md border border-border/40 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="truncate font-mono text-[12px]">{o.url}</div>
                {o.label && (
                  <div className="truncate text-[10px] text-muted-foreground">
                    {o.label}
                  </div>
                )}
              </div>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {o.kind}
              </span>
              <button
                type="button"
                onClick={() => remove(o.url)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-md border border-dashed border-border/60 p-3">
          <div className="text-[11px] font-medium text-muted-foreground">
            Add a custom origin
          </div>
          <div className="grid grid-cols-[1fr_120px_auto] gap-2">
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://hq.example.com"
              className="h-8 text-[12px] font-mono"
            />
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (optional)"
              className="h-8 text-[12px]"
            />
            <Button
              type="button"
              size="sm"
              onClick={addCustom}
              disabled={!newUrl.trim()}
              className="h-8"
            >
              Add
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {saved && (
            <span className="text-[11px] text-status-success">Saved</span>
          )}
          <Button onClick={save} disabled={pending || !workspaceId}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </section>
    </div>
  );
}

