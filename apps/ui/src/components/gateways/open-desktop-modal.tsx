"use client";

// Fullscreen overlay for the gateway's noVNC desktop. Opened from the
// rail's "Open desktop" button on either an agent page or a gateway
// page.
//
// Why a modal and not a tab:
//   - The noVNC iframe wants the whole viewport.
//   - The user opens it briefly + intentionally — verify state, take
//     over a stuck flow, watch a run.
//   - Closing returns them to the rail/tabs context they were just in.
//
// Esc closes (when focus is outside an input). Click outside DOES NOT
// close — the overlay would steal mouse events that should go to the
// remote desktop. The X button is the explicit close.

import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface OpenDesktopModalProps {
  open: boolean;
  onClose: () => void;
  /** Full URL to the gateway's noVNC endpoint, including query params. */
  novncUrl: string | null;
  /** Headline shown in the top bar — usually "Desktop · <agent or gateway label>". */
  title: string;
  /** Optional subtitle — usually "running on <gateway label>" for agents. */
  subtitle?: string;
}

export function OpenDesktopModal({
  open,
  onClose,
  novncUrl,
  title,
  subtitle,
}: OpenDesktopModalProps) {
  // Esc closes — but only when focus isn't on an editable surface
  // (which on this modal would be the iframe; we don't capture inside
  // it, but in case the modal opens with focus elsewhere).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 bg-background px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-foreground">
            {title}
          </span>
          {subtitle && (
            <span className="truncate text-[12px] text-muted-foreground">
              · {subtitle}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {novncUrl && (
            <a
              href={novncUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Open in a new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Pop out
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close desktop"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className={cn("min-h-0 flex-1 bg-black")}>
        {novncUrl ? (
          <iframe
            src={novncUrl}
            title={title}
            className="h-full w-full border-0"
            // sandbox kept loose — the iframe is talking to the user's
            // own gateway over their tailnet/LAN. Stricter sandboxing
            // would break clipboard sync and websocket auth flows.
            allow="clipboard-read; clipboard-write"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            This gateway hasn&apos;t reported a noVNC URL yet. Wait for it
            to come online or check Settings → Gateways → the gateway →
            Reachable URLs.
          </div>
        )}
      </div>
    </div>
  );
}
