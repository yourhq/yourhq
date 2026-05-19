"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionCommandState } from "@/lib/connections/types";

// ─── Types ──────────────────────────────────────────────────────────

export interface OAuthFlowContext {
  providerDisplayName: string;
  mode: "oauth_paste" | "device_code";
  /** True when the gateway is local and localhost:1455 can catch the redirect. */
  autoCallback?: boolean;
}

export interface OAuthInteractiveFlowProps {
  state: ConnectionCommandState;
  context: OAuthFlowContext;
  onPaste: (value: string) => void;
  submittingPaste?: boolean;
  error?: string | null;
  className?: string;
}

// ─── Guidance ───────────────────────────────────────────────────────

function PreFlowGuidance({ context }: { context: OAuthFlowContext }) {
  const { mode, autoCallback, providerDisplayName } = context;

  if (mode === "device_code") {
    return (
      <GuidanceBox>
        <GuidanceStep n={1}>
          We&apos;ll show you a short code and a URL.
        </GuidanceStep>
        <GuidanceStep n={2}>
          Open the URL in your browser, enter the code, and approve the
          sign-in.
        </GuidanceStep>
        <GuidanceStep n={3}>
          Come back here — this will close on its own once approved.
        </GuidanceStep>
      </GuidanceBox>
    );
  }

  if (autoCallback) {
    return (
      <GuidanceBox>
        <GuidanceStep n={1}>
          We&apos;ll open {providerDisplayName} in a new tab.
        </GuidanceStep>
        <GuidanceStep n={2}>
          Sign in.{" "}
          <span className="text-foreground">
            This will close on its own — nothing else to do.
          </span>
        </GuidanceStep>
      </GuidanceBox>
    );
  }

  return (
    <GuidanceBox>
      <GuidanceStep n={1}>
        We&apos;ll open {providerDisplayName} in a new tab.
      </GuidanceStep>
      <GuidanceStep n={2}>
        Sign in normally. After signing in, your browser will try to
        redirect to a <code className="text-[10px] font-mono bg-muted/60 px-1 py-0.5 rounded">localhost</code> address.{" "}
        <span className="text-foreground font-medium">
          The page won&apos;t load — that&apos;s completely normal.
        </span>
      </GuidanceStep>
      <GuidanceStep n={3}>
        Copy the <span className="text-foreground">full URL</span> from
        your browser&apos;s address bar and paste it back here.
      </GuidanceStep>
    </GuidanceBox>
  );
}

function GuidanceBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3.5 py-3 text-[12px] leading-relaxed">
      <ol className="space-y-1.5 text-muted-foreground">{children}</ol>
    </div>
  );
}

function GuidanceStep({
  n,
  children,
}: {
  n: number;
  children: React.ReactNode;
}) {
  return (
    <li>
      <span className="mr-1.5 font-medium text-foreground">{n}.</span>
      {children}
    </li>
  );
}

// ─── Dead redirect hint ─────────────────────────────────────────────

function DeadRedirectHint() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500/70" />
      <div>
        <span className="font-medium text-foreground">
          Seeing a page that won&apos;t load?
        </span>{" "}
        That&apos;s expected — copy the{" "}
        <span className="text-foreground">full URL</span> from your
        browser&apos;s address bar (it starts with{" "}
        <code className="text-[10px] font-mono bg-muted/60 px-1 py-0.5 rounded">
          http://localhost
        </code>
        ) and paste it below.
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────

export function OAuthInteractiveFlow({
  state,
  context,
  onPaste,
  submittingPaste,
  error,
  className,
}: OAuthInteractiveFlowProps) {
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState<"url" | "code" | null>(null);
  const [pasteSubmitted, setPasteSubmitted] = useState(false);

  const { mode, autoCallback } = context;
  const verifying = pasteSubmitted && !submittingPaste && state.stage !== "completed" && state.stage !== "failed";

  useEffect(() => {
    if (error) setPasteSubmitted(false);
  }, [error]);

  async function copy(value: string, key: "url" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {}
  }

  return (
    <div className={cn("space-y-3", className)}>
      {state.stage === "starting" && (
        <div className="space-y-3">
          <PreFlowGuidance context={context} />
          <div className="flex items-center gap-2 py-1 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Preparing sign-in…
          </div>
        </div>
      )}

      {(state.stage === "url_ready" || state.stage === "polling") && (
        <div className="space-y-3">
          {/* URL */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground">
              {mode === "device_code" ? "Step 1 — open this URL" : "Step 1 — open this URL"}
            </label>
            <div className="flex gap-1.5">
              <input
                value={state.url}
                readOnly
                className="flex h-9 w-full min-w-0 rounded-lg border border-border/60 bg-background px-3 text-[11px] font-mono outline-none truncate"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => copy(state.url, "url")}
                className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Copy URL"
              >
                {copied === "url" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <a
              href={state.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-foreground text-background px-4 text-[12px] font-medium hover:bg-foreground/90 transition-colors w-full sm:w-auto"
            >
              Open in browser
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Verification code (device_code flow) */}
          {state.verificationCode && (
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground">
                Step 2 — enter this code on that page
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-[16px] sm:text-[18px] tracking-[0.2em] sm:tracking-[0.3em] text-foreground">
                  {state.verificationCode}
                </code>
                <button
                  type="button"
                  onClick={() => copy(state.verificationCode!, "code")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {copied === "code" ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-status-success" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Waiting indicator */}
          {mode === "device_code" ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Waiting for you to approve in your browser…
            </div>
          ) : autoCallback ? (
            <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for sign-in to complete…
              </div>
              <p className="text-[10.5px] text-muted-foreground/70">
                This will close automatically once you finish signing in.
              </p>
            </div>
          ) : verifying ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-[12px] text-foreground animate-in fade-in duration-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              Verifying credentials — this can take a few seconds…
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for sign-in to complete…
              </div>

              <DeadRedirectHint />

              {/* Paste-back input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">
                  Paste the redirect URL here
                </label>
                <div className="flex gap-1.5">
                  <input
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder="http://localhost:1455/callback?code=…"
                    className="flex h-9 w-full min-w-0 rounded-lg border border-border/60 bg-background px-3 text-[11px] font-mono outline-none placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && pasted.trim()) {
                        setPasteSubmitted(true);
                        onPaste(pasted.trim());
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!pasted.trim() || submittingPaste}
                    onClick={() => {
                      if (pasted.trim()) {
                        setPasteSubmitted(true);
                        onPaste(pasted.trim());
                      }
                    }}
                    className={cn(
                      "shrink-0 inline-flex h-9 items-center rounded-lg px-3 text-[12px] font-medium transition-colors",
                      !pasted.trim() || submittingPaste
                        ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                        : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
                    )}
                  >
                    {submittingPaste ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Submit"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {state.stage === "completed" && (
        <div className="flex items-center gap-2 rounded-lg border border-status-success/40 bg-status-success/5 px-3 py-2 text-[12px] text-status-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Signed in. Saving credential…
        </div>
      )}

      {state.stage === "failed" && (
        <p className="text-[12px] text-destructive animate-in fade-in duration-150">
          {state.error || "Sign-in failed."}
        </p>
      )}

      {error && state.stage !== "failed" && (
        <p className="text-[12px] text-destructive animate-in fade-in duration-150">
          {error}
        </p>
      )}
    </div>
  );
}
