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
//
// Visual anatomy mirrors AddProjectDialog: padded body, bordered
// header/footer, inline destructive alert for errors (no toasts inside
// modal forms).

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
      <DialogContent className="sm:max-w-md p-0 gap-0">
        {/* Mount the inner only while open so closing yields a clean tree
            on next open — no effect-driven reset needed. */}
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
      <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
        <DialogTitle className="text-heading">Add a gateway</DialogTitle>
        <DialogDescription className="text-caption text-muted-foreground">
          A gateway is a computer where agents run. Add another one to split
          work between machines (e.g. one at home, one in the cloud) or to
          keep an agent running 24/7 even when your laptop is asleep.
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
        <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground">
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
          onClose={onClose}
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
      className="flex flex-col"
    >
      <div className="px-5 py-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="gw-label" className="text-[12px]">
            Name this gateway
          </Label>
          <Input
            id="gw-label"
            name="label"
            autoFocus
            placeholder='e.g. "Home Mac mini" or "Cloud box"'
            defaultValue=""
            maxLength={60}
          />
          <p className="text-[11px] text-muted-foreground/70">
            Anything you&apos;ll recognize. You can rename it later.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="gw-tailscale" className="text-[12px]">
            Tailscale auth key
            <span className="ml-1 font-normal text-muted-foreground/70">
              (optional, recommended for remote machines)
            </span>
          </Label>
          <Input
            id="gw-tailscale"
            name="tailscale"
            type="password"
            placeholder="tskey-auth-…"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[12px]"
          />
          <p className="text-[11px] text-muted-foreground/70">
            Tailscale is a free private network that lets this UI reach a
            gateway on a different machine without opening any ports.
            Skip if the gateway is on this same computer or on your
            local network.{" "}
            <a
              href="https://login.tailscale.com/admin/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Get an auth key →
            </a>
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px]">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span className="min-w-0 text-destructive">{error}</span>
          </div>
        )}
      </div>

      <DialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
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
  onClose,
}: {
  bootstrap: MintedGatewayBootstrap;
  copied: boolean;
  onCopy: () => void;
  onConsumed: (gatewayId: string) => void;
  onExpired: () => void;
  onClose: () => void;
}) {
  // Refs so the polling effect doesn't re-arm on every parent render.
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
    <>
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />
          Run this on the new gateway machine:
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
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Waiting for the gateway to connect…
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/60">
          Token expires in 15 min. The dialog updates automatically when the
          gateway registers.
        </p>
      </div>

      <DialogFooter className="px-5 py-3 border-t border-border/50">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
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
    <>
      <div className="px-5 py-4">
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[12px]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="min-w-0 text-amber-300">
            Token expired before the gateway connected. Generate a new one
            and re-run the install command.
          </span>
        </div>
      </div>
      <DialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={onRegenerate}>
          Generate new token
        </Button>
      </DialogFooter>
    </>
  );
}

// ─── Connected ───────────────────────────────────────────────────────

function ConnectedPhase({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="px-5 py-4">
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-[12px]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <div className="min-w-0 space-y-0.5">
            <div className="font-medium text-foreground">
              Gateway connected
            </div>
            <p className="text-muted-foreground">
              You&apos;re all set. When you create a new agent you&apos;ll
              be able to pick this gateway as its home.
            </p>
          </div>
        </div>
      </div>
      <DialogFooter className="px-5 py-3 border-t border-border/50">
        <Button type="button" size="sm" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
