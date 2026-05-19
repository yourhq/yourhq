"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Loader2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle2,
  Shield,
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
import { StaggeredEntrance } from "./staggered-entrance";
import {
  OAuthInteractiveFlow,
  type OAuthFlowContext,
} from "@/components/connections/oauth-interactive-flow";

const OAUTH_PROVIDERS = new Set([
  "openai-codex", "github-copilot", "google-gemini-cli", "minimax-portal",
]);

const AUTH_SHAPE_LABELS: Record<string, string> = {
  api_key: "API key",
  oauth_paste: "Sign in",
  device_code: "Sign in",
  cli_reuse: "CLI login",
  local_url: "Local",
};

export interface StepProviderProps {
  onSubmit: (provider: string, apiKey: string) => void;
  pending: boolean;
  validating: boolean;
  validated: boolean;
  validationError?: string | null;
  isHosted?: boolean;
  collectOnly?: boolean;
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
  isHosted,
  collectOnly,
}: StepProviderProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // OAuth interactive state
  const [oauthPhase, setOauthPhase] = useState<OAuthPhase>({ kind: "idle" });
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [submittingPaste, setSubmittingPaste] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recommended = PROVIDER_CATALOG.filter((p) => p.category === "recommended");
  const openModels = PROVIDER_CATALOG.filter((p) => p.category === "open_models");
  const others = PROVIDER_CATALOG.filter((p) => p.category === "all");

  const selectedEntry = PROVIDER_CATALOG.find((p) => p.id === selected);
  const needsKey = selectedEntry && selectedEntry.authShape === "api_key";
  const isLocal = selectedEntry?.authShape === "local_url";
  const isOAuth = selectedEntry && OAUTH_PROVIDERS.has(selectedEntry.id);

  const canSubmit = collectOnly
    ? selected && (isOAuth || isLocal || apiKey.trim().length > 5) && !pending
    : selected &&
      !isOAuth &&
      (isLocal || apiKey.trim().length > 5) &&
      !validating &&
      !pending;

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSelectProvider = (id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setSelected(id);
    setApiKey("");
    setShowKey(false);
    setOauthPhase({ kind: "idle" });
    setOauthError(null);
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

  const handlePaste = useCallback(async (value: string) => {
    if (oauthPhase.kind !== "interactive" || !value) return;
    setSubmittingPaste(true);
    const r = await submitOAuthPaste(oauthPhase.commandId, value);
    setSubmittingPaste(false);
    if (!r.ok) {
      setOauthError(r.error ?? "Failed to submit code");
    }
  }, [oauthPhase]);

  const handleOAuthContinue = useCallback(() => {
    if (oauthPhase.kind !== "done") return;
    onSubmit(oauthPhase.provider.id, "");
  }, [oauthPhase, onSubmit]);

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
            "w-full flex items-center gap-2.5 sm:gap-3 rounded-xl border px-3 sm:px-4 py-3 text-left transition-all duration-150 cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isSelected
              ? "border-primary/50 bg-primary/[0.04] ring-1 ring-primary/10"
              : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
          )}
        >
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            isSelected ? "bg-primary/10" : "bg-muted/60",
          )}>
            <ProviderIcon
              providerId={p.id}
              className="h-4.5 w-4.5 shrink-0 text-foreground/80"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 sm:gap-2 flex-wrap">
              <span className="text-[13px] sm:text-[14px] font-medium">{p.displayName}</span>
              <span className="text-[10px] sm:text-[11px] text-muted-foreground/50">
                {AUTH_SHAPE_LABELS[p.authShape] ?? p.authShape}
              </span>
            </div>
            {p.blurb && (
              <p className="text-[12px] text-muted-foreground/70 leading-snug mt-0.5">{p.blurb}</p>
            )}
          </div>
          {isSelected && oauthPhase.kind !== "done" && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0">
              <Check className="h-3 w-3" strokeWidth={3} />
            </div>
          )}
          {isSelected && oauthPhase.kind === "done" && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-status-success text-primary-foreground shrink-0">
              <Check className="h-3 w-3" strokeWidth={3} />
            </div>
          )}
        </button>

        {/* API key input */}
        {isSelected && needsKey && (
          <div className="mx-2 sm:mx-3 border-x border-b border-border/40 rounded-b-lg px-3 sm:px-4 pb-4 pt-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Paste your ${p.displayName} API key`}
                aria-label={`${p.displayName} API key`}
                autoFocus
                className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 pr-9 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) handleSubmit();
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
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
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                Don&apos;t have a key? Get one here
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            {!collectOnly && validationError && (
              <p className="text-[12px] text-destructive animate-in fade-in duration-150">
                {validationError}
              </p>
            )}
            {!collectOnly && validated && (
              <div className="flex items-center gap-1.5 rounded-lg border border-status-success/30 bg-status-success/5 px-3 py-2 text-[12px] text-status-success animate-in fade-in duration-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Key validated — connected to {p.displayName}
              </div>
            )}
          </div>
        )}

        {/* Local provider */}
        {isSelected && isLocal && (
          <div className="mx-2 sm:mx-3 border-x border-b border-border/40 rounded-b-lg px-3 sm:px-4 pb-4 pt-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <p className="text-[12px] text-muted-foreground">
              HQ will auto-detect {p.displayName} running on your gateway. No API key needed.
            </p>
            {validationError && (
              <p className="mt-2 text-[12px] text-destructive animate-in fade-in duration-150">
                {validationError}
              </p>
            )}
          </div>
        )}

        {/* OAuth provider — collect-only deferred message */}
        {isSelected && providerIsOAuth && collectOnly && (
          <div className="mx-2 sm:mx-3 border-x border-b border-border/40 rounded-b-lg px-3 sm:px-4 pb-4 pt-3 animate-in fade-in slide-in-from-top-1 duration-150">
            <p className="text-[12px] text-muted-foreground">
              You&apos;ll sign in with {p.displayName} once your workspace is set up.
            </p>
          </div>
        )}

        {/* OAuth provider — inline interactive flow */}
        {isSelected && providerIsOAuth && !collectOnly && (
          <div className="mx-2 sm:mx-3 border-x border-b border-border/40 rounded-b-lg px-3 sm:px-4 pb-4 pt-3 animate-in fade-in slide-in-from-top-1 duration-150">
            {oauthPhase.kind === "idle" && (
              <div className="space-y-3">
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

            {(oauthPhase.kind === "starting" || oauthPhase.kind === "interactive") && (
              <OAuthInteractiveFlow
                state={
                  oauthPhase.kind === "starting"
                    ? { stage: "starting" }
                    : oauthPhase.state
                }
                context={{
                  providerDisplayName: p.displayName,
                  mode: oauthPhase.mode,
                  autoCallback:
                    oauthPhase.kind === "interactive" &&
                    oauthPhase.state.stage === "url_ready"
                      ? oauthPhase.state.autoCallback
                      : undefined,
                }}
                onPaste={handlePaste}
                submittingPaste={submittingPaste}
                error={oauthError}
              />
            )}

            {oauthPhase.kind === "done" && (
              <div className="flex items-center gap-1.5 rounded-lg border border-status-success/30 bg-status-success/5 px-3 py-2 text-[12px] text-status-success animate-in fade-in duration-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {p.displayName} connected
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <StaggeredEntrance index={0}>
        <div className="space-y-2">
          <h1 className="text-[24px] md:text-[28px] font-semibold leading-[1.15] tracking-tight">
            Connect your AI provider
          </h1>
          <p className="max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
            Choose the model provider your agents will use.{" "}
            {isHosted
              ? "Your key is stored securely in your private workspace."
              : "Your key stays on your gateway — HQ and the LLMs never see it."}{" "}
            You can add more providers later in Settings.
          </p>
        </div>
      </StaggeredEntrance>

      <StaggeredEntrance index={1}>
        <div role="radiogroup" aria-label="Choose AI provider" className="space-y-2">
          {recommended.map(renderProvider)}

          {showAll && (
            <>
              <div className="pt-3 pb-1">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/50 px-1">
                  Local / Open-source
                </div>
              </div>
              {openModels.map(renderProvider)}

              <div className="pt-3 pb-1">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/50 px-1">
                  All providers
                </div>
              </div>
              {others.map(renderProvider)}
            </>
          )}

          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors px-1 pt-1"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Show fewer providers
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Show all {openModels.length + others.length} providers
              </>
            )}
          </button>
        </div>
      </StaggeredEntrance>

      <StaggeredEntrance index={2}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {!collectOnly && oauthPhase.kind === "done" ? (
              <button
                type="button"
                onClick={handleOAuthContinue}
                disabled={pending}
                className="group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.97]"
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
                    : "bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.97]",
                )}
              >
                {validating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Validating key…
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

          {!isHosted && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
              <Shield className="h-3 w-3" />
              Your API key is stored locally on your gateway and never leaves your infrastructure.
            </p>
          )}
        </div>
      </StaggeredEntrance>
    </div>
  );
}
