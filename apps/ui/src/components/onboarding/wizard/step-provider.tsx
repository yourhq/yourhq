"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  Copy,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROVIDER_CATALOG,
  type ProviderCatalogEntry,
  type ConnectionCommandState,
} from "@/lib/connections/types";
import { ProviderIcon } from "@/components/connections/provider-icons";
import {
  startOAuthFlow,
  submitOAuthPaste,
  pollCommandState,
  saveOAuthProvider,
} from "./actions";

const OAUTH_PROVIDERS = new Set([
  "openai-codex", "github-copilot", "google-gemini-cli", "minimax-portal",
]);

const AUTH_SHAPE_LABELS: Record<string, string> = {
  api_key: "API key",
  oauth_paste: "Sign in",
  device_code: "Sign in",
  cli_reuse: "Reuses CLI login",
  local_url: "Local — no key needed",
};

export interface StepProviderProps {
  onSubmit: (provider: string, apiKey: string) => void;
  pending: boolean;
  validating: boolean;
  validated: boolean;
  validationError?: string | null;
}

type OAuthPhase =
  | { kind: "idle" }
  | { kind: "starting"; provider: ProviderCatalogEntry; mode: "oauth_paste" | "device_code" }
  | {
      kind: "interactive";
      provider: ProviderCatalogEntry;
      mode: "oauth_paste" | "device_code";
      commandId: string;
      state: ConnectionCommandState;
    }
  | { kind: "done"; provider: ProviderCatalogEntry };

export function StepProvider({
  onSubmit,
  pending,
  validating,
  validated,
  validationError,
}: StepProviderProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // OAuth interactive state
  const [oauthPhase, setOauthPhase] = useState<OAuthPhase>({ kind: "idle" });
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [submittingPaste, setSubmittingPaste] = useState(false);
  const [copied, setCopied] = useState<"url" | "code" | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recommended = PROVIDER_CATALOG.filter((p) => p.category === "recommended");
  const openModels = PROVIDER_CATALOG.filter((p) => p.category === "open_models");
  const others = PROVIDER_CATALOG.filter((p) => p.category === "all");

  const selectedEntry = PROVIDER_CATALOG.find((p) => p.id === selected);
  const needsKey = selectedEntry && selectedEntry.authShape === "api_key";
  const isLocal = selectedEntry?.authShape === "local_url";
  const isOAuth = selectedEntry && OAUTH_PROVIDERS.has(selectedEntry.id);

  const canSubmit =
    selected &&
    !isOAuth &&
    (isLocal || apiKey.trim().length > 5) &&
    !validating &&
    !pending;

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSelectProvider = (id: string) => {
    // Reset everything when switching providers
    if (pollRef.current) clearInterval(pollRef.current);
    setSelected(id);
    setApiKey("");
    setShowKey(false);
    setOauthPhase({ kind: "idle" });
    setOauthError(null);
    setPasted("");
  };

  const handleSubmit = () => {
    if (!selected) return;
    onSubmit(selected, apiKey.trim());
  };

  const handleStartOAuth = useCallback(async (entry: ProviderCatalogEntry) => {
    const mode: "oauth_paste" | "device_code" =
      entry.authShape === "device_code" ? "device_code" : "oauth_paste";

    setOauthPhase({ kind: "starting", provider: entry, mode });
    setOauthError(null);
    setPasted("");

    const r = await startOAuthFlow(entry.id, mode);
    if (!r.ok || !r.data) {
      setOauthError(r.error ?? "Failed to start sign-in");
      setOauthPhase({ kind: "idle" });
      return;
    }

    const commandId = r.data.commandId;
    setOauthPhase({
      kind: "interactive",
      provider: entry,
      mode,
      commandId,
      state: { stage: "starting" },
    });

    // Poll for state changes
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const poll = await pollCommandState(commandId);
      if (!poll.ok || !poll.data) return;

      const cs = (poll.data.payload?.connection_state ?? null) as ConnectionCommandState | null;
      if (cs) {
        setOauthPhase((prev) => {
          if (prev.kind !== "interactive") return prev;
          return { ...prev, state: cs };
        });
      }

      if (poll.data.status === "done") {
        if (pollRef.current) clearInterval(pollRef.current);
        setOauthPhase({ kind: "done", provider: entry });
        // Save and advance
        await saveOAuthProvider(entry.id);
      } else if (poll.data.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
        setOauthError(
          (poll.data.payload?.error_message as string) ?? "Sign-in failed.",
        );
        setOauthPhase({ kind: "idle" });
      }
    }, 1500);
  }, []);

  const handlePaste = useCallback(async () => {
    if (oauthPhase.kind !== "interactive" || !pasted.trim()) return;
    setSubmittingPaste(true);
    const r = await submitOAuthPaste(oauthPhase.commandId, pasted.trim());
    setSubmittingPaste(false);
    if (!r.ok) {
      setOauthError(r.error ?? "Failed to submit code");
    }
  }, [oauthPhase, pasted]);

  const handleOAuthContinue = useCallback(() => {
    if (oauthPhase.kind !== "done") return;
    onSubmit(oauthPhase.provider.id, "");
  }, [oauthPhase, onSubmit]);

  async function copyToClipboard(value: string, key: "url" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {}
  }

  const renderProvider = (p: ProviderCatalogEntry) => {
    const isSelected = selected === p.id;
    const providerIsOAuth = OAUTH_PROVIDERS.has(p.id);
    return (
      <div key={p.id}>
        <button
          type="button"
          role="radio"
          aria-checked={isSelected}
          onClick={() => handleSelectProvider(p.id)}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-150 cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isSelected
              ? "border-foreground/60 bg-foreground/[0.04] ring-1 ring-foreground/10"
              : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
          )}
        >
          <ProviderIcon
            providerId={p.id}
            className="h-5 w-5 shrink-0 text-foreground/70"
          />
          <div className="flex-1 min-w-0">
            <span className="text-[14px] font-medium">{p.displayName}</span>
            {p.blurb && (
              <span className="ml-2 text-[12px] text-muted-foreground">{p.blurb}</span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground/60 shrink-0">
            {AUTH_SHAPE_LABELS[p.authShape] ?? p.authShape}
          </span>
          {isSelected && oauthPhase.kind !== "done" && (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background shrink-0">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </div>
          )}
          {isSelected && oauthPhase.kind === "done" && (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-white shrink-0">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </div>
          )}
        </button>

        {/* API key input */}
        {isSelected && needsKey && (
          <div className="px-4 pb-3 pt-2.5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key"
                aria-label={`${p.displayName} API key`}
                autoFocus
                className="flex h-9 w-full rounded-lg border border-border/60 bg-background px-3 pr-9 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) handleSubmit();
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
                aria-label={showKey ? "Hide API key" : "Show API key"}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {p.helpUrl && (
              <a
                href={p.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors underline underline-offset-2"
              >
                Get an API key →
              </a>
            )}
            {validationError && (
              <p className="text-[12px] text-destructive animate-in fade-in duration-150">
                {validationError}
              </p>
            )}
            {validated && (
              <p className="flex items-center gap-1.5 text-[12px] text-green-600 animate-in fade-in duration-200">
                <Check className="h-3 w-3" />
                Connected
              </p>
            )}
          </div>
        )}

        {/* Local provider */}
        {isSelected && isLocal && (
          <div className="px-4 pb-3 pt-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
            <p className="text-[12px] text-muted-foreground">
              We&apos;ll auto-detect {p.displayName} running on your gateway. No API key needed.
            </p>
            {validationError && (
              <p className="mt-1.5 text-[12px] text-destructive animate-in fade-in duration-150">
                {validationError}
              </p>
            )}
          </div>
        )}

        {/* OAuth provider — inline interactive flow */}
        {isSelected && providerIsOAuth && (
          <div className="px-4 pb-3 pt-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
            {oauthPhase.kind === "idle" && (
              <div className="space-y-3">
                <p className="text-[12px] text-muted-foreground">
                  {p.authShape === "device_code"
                    ? "You’ll get a short code and a URL. Enter the code on that page to connect."
                    : "Click below to open the sign-in page. After signing in, you may need to paste the redirect URL back here."}
                </p>
                {oauthError && (
                  <p className="text-[12px] text-destructive animate-in fade-in duration-150">
                    {oauthError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => handleStartOAuth(p)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-foreground/[0.04] px-3.5 py-2 text-[13px] font-medium transition-colors hover:bg-foreground/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Sign in with {p.displayName}
                </button>
              </div>
            )}

            {oauthPhase.kind === "starting" && (
              <div className="flex items-center gap-2 py-3 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting sign-in flow…
              </div>
            )}

            {oauthPhase.kind === "interactive" && (
              <div className="space-y-3">
                {oauthPhase.state.stage === "starting" && (
                  <div className="flex items-center gap-2 py-3 text-[12px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Starting sign-in flow…
                  </div>
                )}

                {(oauthPhase.state.stage === "url_ready" || oauthPhase.state.stage === "polling") && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[12px] font-medium text-foreground">
                        Open this URL to sign in
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          value={oauthPhase.state.url}
                          readOnly
                          className="flex h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-[11px] font-mono outline-none"
                          onFocus={(e) => e.currentTarget.select()}
                        />
                        <button
                          type="button"
                          onClick={() => copyToClipboard(oauthPhase.state.stage !== "starting" ? (oauthPhase.state as { url: string }).url : "", "url")}
                          className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title="Copy URL"
                        >
                          {copied === "url" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <a
                          href={oauthPhase.state.url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-foreground text-background px-3 text-[12px] font-medium hover:bg-foreground/90 transition-colors"
                        >
                          Open
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    {oauthPhase.state.verificationCode && (
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-medium text-foreground">
                          Enter this code on that page
                        </label>
                        <div className="flex items-center gap-2">
                          <code className="rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-[18px] tracking-[0.3em] text-foreground">
                            {oauthPhase.state.verificationCode}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(oauthPhase.state.stage !== "starting" ? ((oauthPhase.state as { verificationCode?: string }).verificationCode ?? "") : "", "code")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          >
                            {copied === "code" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            {copied === "code" ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    )}

                    {oauthPhase.mode === "device_code" ? (
                      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Waiting for you to approve in your browser…
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Waiting for sign-in to complete…
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">
                            Or paste the redirect URL manually
                          </label>
                          <div className="flex gap-1.5">
                            <input
                              value={pasted}
                              onChange={(e) => setPasted(e.target.value)}
                              placeholder="https://… or the code from the page"
                              className="flex h-9 w-full rounded-lg border border-border/60 bg-background px-3 text-[11px] font-mono outline-none placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                            />
                            <button
                              type="button"
                              disabled={!pasted.trim() || submittingPaste}
                              onClick={handlePaste}
                              className={cn(
                                "shrink-0 inline-flex h-9 items-center rounded-lg px-3 text-[12px] font-medium transition-colors",
                                !pasted.trim() || submittingPaste
                                  ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                                  : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
                              )}
                            >
                              {submittingPaste ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {oauthPhase.state.stage === "completed" && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/5 px-3 py-2 text-[12px] text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Signed in. Saving credential…
                  </div>
                )}

                {oauthPhase.state.stage === "failed" && (
                  <p className="text-[12px] text-destructive animate-in fade-in duration-150">
                    {oauthPhase.state.error || "Sign-in failed."}
                  </p>
                )}

                {oauthError && (
                  <p className="text-[12px] text-destructive animate-in fade-in duration-150">
                    {oauthError}
                  </p>
                )}
              </div>
            )}

            {oauthPhase.kind === "done" && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-[12px] text-green-600 animate-in fade-in duration-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {p.displayName} connected
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          AI Provider
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Connect an AI provider
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          Your API key stays on your gateway. HQ never sees or stores it.
          You can connect more providers later in Settings.
        </p>
      </div>

      <div role="radiogroup" aria-label="Choose AI provider" className="space-y-4">
        <div className="space-y-2">
          {recommended.map(renderProvider)}
        </div>

        {showAll && (
          <>
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/50 px-1 pt-2">
                Local / Open-source
              </div>
              <div className="space-y-2">
                {openModels.map(renderProvider)}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/50 px-1 pt-2">
                All providers
              </div>
              <div className="space-y-2">
                {others.map(renderProvider)}
              </div>
            </div>
          </>
        )}

        {!showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors px-1"
          >
            <ChevronDown className="h-3 w-3" />
            Show all {openModels.length + others.length} providers
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        {oauthPhase.kind === "done" ? (
          <button
            type="button"
            onClick={handleOAuthContinue}
            disabled={pending}
            className="group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]"
          >
            {pending ? "Saving…" : (
              <>
                Continue
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
              !canSubmit
                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
            )}
          >
            {validating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Validating…
              </>
            ) : pending ? (
              "Saving…"
            ) : isLocal ? (
              <>
                Detect &amp; continue
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
