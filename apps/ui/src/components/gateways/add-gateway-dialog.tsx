"use client";

// Settings → Gateways → "Add Gateway" dialog. Three phases:
//
//   1. form          — friendly name + optional Tailscale auth key
//   2. one-liner     — show the curl|bash command + spinner waiting
//                      for the remote install-gateway.sh to call
//                      consume_gateway_token()
//   3. connected     — green check, "Done"
//
// Polls every 3s for up to ~16 minutes (token TTL is 15 min). If we
// don't see a consumption in that window we fall back to a "regenerate"
// button so the user can mint a new token without restarting.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Terminal,
} from "lucide-react";
import {
  mintGatewayTokenForSettings,
  pollGatewayTokenAction,
  type MintedGatewayBootstrap,
} from "@/app/dashboard/settings/gateways/actions";

interface AddGatewayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (gatewayId: string) => void;
}

type Phase =
  | { kind: "form" }
  | { kind: "minting" }
  | { kind: "waiting"; bootstrap: MintedGatewayBootstrap }
  | { kind: "expired"; lastBootstrap: MintedGatewayBootstrap }
  | { kind: "connected"; bootstrap: MintedGatewayBootstrap; gatewayId: string };

export function AddGatewayDialog({
  open,
  onOpenChange,
  onAdded,
}: AddGatewayDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        {/* Mount the inner under a fresh key per open — gives us a clean
            slate (form phase, no error, no copied flag) without an effect
            that synchronously calls setState. */}
        {open && (
          <AddGatewayDialogInner
            onClose={() => onOpenChange(false)}
            onAdded={onAdded}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddGatewayDialogInner({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded?: (gatewayId: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add a gateway</DialogTitle>
        <DialogDescription>
          A gateway is the machine where your agents run. Add another
          one to spread workload across hosts or run agents closer to
          you (e.g. on a laptop, NAS, or VPS).
        </DialogDescription>
      </DialogHeader>

      {phase.kind === "form" && (
        <FormPhase
          onCancel={onClose}
          onSubmit={async (input) => {
            setError(null);
            setPhase({ kind: "minting" });
            const r = await mintGatewayTokenForSettings(input);
            if (!r.ok || !r.data) {
              setError(r.error ?? "Failed to mint token");
              setPhase({ kind: "form" });
              return;
            }
            setPhase({ kind: "waiting", bootstrap: r.data });
          }}
          error={error}
        />
      )}

      {phase.kind === "minting" && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating registration token…
        </div>
      )}

      {phase.kind === "waiting" && (
        <WaitingPhase
          bootstrap={phase.bootstrap}
          copied={copied}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(phase.bootstrap.oneLiner);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {}
          }}
          onConsumed={(gatewayId) => {
            setPhase({
              kind: "connected",
              bootstrap: phase.bootstrap,
              gatewayId,
            });
            router.refresh();
            onAdded?.(gatewayId);
          }}
          onExpired={() =>
            setPhase({ kind: "expired", lastBootstrap: phase.bootstrap })
          }
        />
      )}

      {phase.kind === "expired" && (
        <ExpiredPhase
          onRegenerate={async () => {
            setError(null);
            setPhase({ kind: "minting" });
            const r = await mintGatewayTokenForSettings({
              label: phase.lastBootstrap.label,
            });
            if (!r.ok || !r.data) {
              setError(r.error ?? "Failed to mint token");
              setPhase({ kind: "form" });
              return;
            }
            setPhase({ kind: "waiting", bootstrap: r.data });
          }}
          onCancel={onClose}
        />
      )}

      {phase.kind === "connected" && <ConnectedPhase onClose={onClose} />}
    </>
  );
}

// ─── Form ────────────────────────────────────────────────────────────

function FormPhase({
  onCancel,
  onSubmit,
  error,
}: {
  onCancel: () => void;
  onSubmit: (input: {
    label: string;
    tailscaleAuthKey?: string;
  }) => Promise<void>;
  error: string | null;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const label = String(fd.get("label") ?? "").trim() || "Gateway";
        const tailscaleAuthKey =
          String(fd.get("tailscale") ?? "").trim() || undefined;
        setSubmitting(true);
        try {
          await onSubmit({ label, tailscaleAuthKey });
        } finally {
          setSubmitting(false);
        }
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="gw-label">Name</Label>
        <Input
          id="gw-label"
          name="label"
          autoFocus
          placeholder="e.g. Mac mini, EU box, laptop"
          defaultValue=""
          maxLength={60}
        />
        <p className="text-[11px] text-muted-foreground">
          Helps you tell gateways apart in lists.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gw-tailscale">Tailscale auth key (optional)</Label>
        <Input
          id="gw-tailscale"
          name="tailscale"
          type="password"
          placeholder="tskey-auth-…"
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-[12px]"
        />
        <p className="text-[11px] text-muted-foreground">
          Embeds the key into the install command so the new gateway
          joins your tailnet automatically.{" "}
          <a
            href="https://login.tailscale.com/admin/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Create one
          </a>
          .
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-[12px] text-red-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Generating…
            </>
          ) : (
            "Generate install command"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Waiting (one-liner shown, polling) ──────────────────────────────

function WaitingPhase({
  bootstrap,
  copied,
  onCopy,
  onConsumed,
  onExpired,
}: {
  bootstrap: MintedGatewayBootstrap;
  copied: boolean;
  onCopy: () => void;
  onConsumed: (gatewayId: string) => void;
  onExpired: () => void;
}) {
  // Keep refs to the latest callbacks so the polling effect doesn't have
  // to re-arm every render. Assignment happens inside an effect (not
  // during render) to satisfy react-hooks/refs.
  const onConsumedRef = useRef(onConsumed);
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onConsumedRef.current = onConsumed;
    onExpiredRef.current = onExpired;
  });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const r = await pollGatewayTokenAction(bootstrap.tokenId);
      if (cancelled) return;
      if (!r.ok || !r.data) return;
      if (r.data.status === "online") {
        onConsumedRef.current(r.data.gatewayId);
        return;
      }
      if (r.data.status === "expired") {
        onExpiredRef.current();
        return;
      }
    };
    const interval = setInterval(tick, 3000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bootstrap.tokenId]);

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-md border border-border/60 bg-card/60 p-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[12px] font-medium">
            Run this on the new gateway machine
          </span>
        </div>
        <pre className="overflow-auto rounded-md border border-border/60 bg-background p-2.5 font-mono text-[10.5px] leading-relaxed text-foreground">
          {bootstrap.oneLiner}
        </pre>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] hover:bg-accent/60"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy command
              </>
            )}
          </button>
          <span className="text-[11px] text-muted-foreground/70">
            Token expires in 15 min.
          </span>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border/40 px-3 py-2">
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-foreground/70" />
        <div className="min-w-0 space-y-0.5">
          <div className="text-[12px]">Waiting for the gateway to register…</div>
          <p className="text-[11px] text-muted-foreground">
            As soon as the install script runs on the other machine, it
            shows up here.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Expired ─────────────────────────────────────────────────────────

function ExpiredPhase({
  onRegenerate,
  onCancel,
}: {
  onRegenerate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-[12px]">
        Token expired before the gateway connected. Generate a new one
        and re-run the install command.
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={onRegenerate}>
          Generate new token
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Connected ───────────────────────────────────────────────────────

function ConnectedPhase({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <div className="min-w-0 space-y-0.5">
          <div className="text-[13px] font-medium">Gateway connected</div>
          <p className="text-[12px] text-muted-foreground">
            The new gateway is registered and running. You can target
            agents at it from the agent create dialog.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}
