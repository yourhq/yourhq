"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Loader2,
  AlertCircle,
  RotateCw,
  CreditCard,
  ExternalLink,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTEXT_PRESETS } from "@/lib/setup/templates";
import { PROVIDER_CATALOG } from "@/lib/connections/types";
import type { ConnectionCommandState } from "@/lib/connections/types";
import {
  createHostedCheckout,
  pollProvisionStatus,
  verifyAndKickProvision,
  retryProvisionAction,
  verifyAutoLogin,
  getHostedEmail,
  sendFreshLoginLink,
} from "./hosted-actions";
import {
  connectProvider,
  createFirstAgent,
  pollAgentProvisionStatus,
  startOAuthFlow,
  submitOAuthPaste,
  pollCommandState,
  saveOAuthProvider,
} from "./actions";

// ─── Types ───────────────────────────────────────────────────────────────────

type LaunchPhase =
  | "summary"
  | "payment"
  | "provisioning"
  | "connecting_provider"
  | "creating_agent"
  | "complete";

interface ProvisionStage {
  key: string;
  label: string;
}

const PROVISION_STAGES: ProvisionStage[] = [
  { key: "creating_project", label: "Creating database" },
  { key: "applying_schema", label: "Applying schema" },
  { key: "creating_user", label: "Setting up your workspace" },
  { key: "starting_sandbox", label: "Starting agent runtime" },
  { key: "waiting_for_gateway", label: "Connecting gateway" },
  { key: "connecting_provider", label: "Connecting AI provider" },
  { key: "creating_agent", label: "Creating your agent" },
  { key: "complete", label: "Ready" },
];

const STAGE_INDEX: Record<string, number> = {
  creating_project: 0,
  waiting_for_project: 0,
  fetching_keys: 0,
  applying_schema: 1,
  creating_user: 2,
  starting_sandbox: 3,
  waiting_for_gateway: 4,
  connecting_provider: 5,
  creating_agent: 6,
  complete: 7,
};

function stageIdx(stage: string | null): number {
  if (!stage) return -1;
  return STAGE_INDEX[stage] ?? -1;
}

function friendlyError(raw: string): string {
  if (raw.includes("project creation failed")) return "We couldn't create your database right now. Our team has been notified.";
  if (raw.includes("did not become ready")) return "Your database is taking longer than expected to initialize.";
  if (raw.includes("Failed to fetch")) return "We ran into a temporary issue connecting to our infrastructure.";
  if (raw.includes("Auth user creation failed")) return "We had trouble setting up your account.";
  if (raw.includes("Gateway did not register")) return "Your agent runtime started but took too long to connect. This is usually temporary.";
  if (raw.includes("setup failed")) return "Workspace initialization didn't complete.";
  if (raw.includes("Invalid API key")) return "Your API key couldn't be verified. You can re-enter it below.";
  return "Something unexpected happened during setup. Our team has been notified.";
}

// ─── OAuth sub-types ─────────────────────────────────────────────────────────

const OAUTH_PROVIDERS = new Set([
  "openai-codex", "github-copilot", "google-gemini-cli", "minimax-portal",
]);

type OAuthPhase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "waiting_for_gateway"; commandId: string }
  | { kind: "interactive"; commandId: string; state: ConnectionCommandState }
  | { kind: "done" };

// ─── Props ───────────────────────────────────────────────────────────────────

export interface StepLaunchProps {
  ownerName: string;
  workspaceName: string;
  intentKey: string;
  email: string;
  providerId: string;
  providerApiKey: string;
  agentName: string;
  agentEmoji: string;
  agentTemplateBranch: string;
  hostedWorkspaceId?: string | null;
  resumeAtProvisioning?: boolean;
  onComplete: (opts: { needsManualLogin: boolean; agentId?: string }) => void;
  onPatch: (data: Record<string, unknown>) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_POLL_MS = 5 * 60 * 1000;
const PENDING_TIMEOUT_MS = 90_000;
const MAX_CONSECUTIVE_FAILURES = 5;

// ─── Component ───────────────────────────────────────────────────────────────

export function StepLaunch({
  ownerName,
  workspaceName,
  intentKey,
  email,
  providerId,
  providerApiKey,
  agentName,
  agentEmoji,
  agentTemplateBranch,
  hostedWorkspaceId: initialWorkspaceId,
  resumeAtProvisioning,
  onComplete,
  onPatch,
}: StepLaunchProps) {
  const [phase, setPhase] = useState<LaunchPhase>(
    resumeAtProvisioning ? "provisioning" : "summary",
  );
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(initialWorkspaceId ?? null);

  // Provisioning state
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [pendingStale, setPendingStale] = useState(false);
  const [kickingProvision, setKickingProvision] = useState(false);
  const pendingSinceRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const pollStartRef = useRef<number>(0);
  const failureCountRef = useRef(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Provider connection state (for OAuth)
  const [oauthPhase, setOauthPhase] = useState<OAuthPhase>({ kind: "idle" });
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [submittingPaste, setSubmittingPaste] = useState(false);
  const [copied, setCopied] = useState<"url" | "code" | null>(null);
  const oauthPollRef = useRef<ReturnType<typeof setInterval> | null>(null);


  // Payment loading
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (oauthPollRef.current) clearInterval(oauthPollRef.current);
    };
  }, []);

  // ─── Summary helpers ──────────────────────────────────────────────────────

  const preset = CONTEXT_PRESETS.find((p) => p.key === intentKey);
  const providerEntry = PROVIDER_CATALOG.find((p) => p.id === providerId);
  const isOAuthProvider = OAUTH_PROVIDERS.has(providerId);

  // ─── Payment ──────────────────────────────────────────────────────────────

  const handleCheckout = useCallback(async () => {
    setError(null);
    setPaymentLoading(true);
    try {
      const result = await createHostedCheckout({
        email,
        ownerName,
        workspaceLabel: workspaceName,
        workspaceEmoji: "🏠",
        contextPreset: intentKey,
      });
      setWorkspaceId(result.workspaceId);
      onPatch({ hostedWorkspaceId: result.workspaceId });
      window.location.href = result.url;
    } catch (err) {
      setError((err as Error).message);
      setPaymentLoading(false);
    }
  }, [email, ownerName, workspaceName, intentKey, onPatch]);

  // ─── Provisioning polling ─────────────────────────────────────────────────

  const pollProvision = useCallback(async () => {
    if (completedRef.current || !workspaceId) return;

    let status: Awaited<ReturnType<typeof pollProvisionStatus>>;
    try {
      status = await pollProvisionStatus(workspaceId);
    } catch {
      failureCountRef.current++;
      if (failureCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
        setError("Unable to reach our servers. Please check your connection and refresh the page.");
      }
      return;
    }

    failureCountRef.current = 0;
    if (!status || completedRef.current) return;

    setSubscriptionStatus(status.subscription_status);

    if (status.provision_stage === "complete") {
      completedRef.current = true;
      setError(null);
      setCurrentStage("complete");
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      // Provision done — move to provider connection
      handleProvisionComplete(status.auto_login_token_hash, status.auto_login_type);
      return;
    }

    if (status.provision_error) {
      setError(status.provision_error);
      setCurrentStage(status.provision_stage);
      return;
    }

    setError(null);

    if (status.subscription_status === "pending") {
      if (!pendingSinceRef.current) pendingSinceRef.current = Date.now();
      if (Date.now() - pendingSinceRef.current > PENDING_TIMEOUT_MS) {
        setPendingStale(true);
      }
      return;
    }

    pendingSinceRef.current = null;
    setPendingStale(false);
    setCurrentStage(status.provision_stage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Start provisioning poll when phase enters "provisioning"
  useEffect(() => {
    if (phase !== "provisioning" || !workspaceId) return;
    if (pollStartRef.current === 0) pollStartRef.current = Date.now();
    pollProvision();
    const interval = setInterval(() => {
      if (Date.now() - pollStartRef.current > MAX_POLL_MS) {
        clearInterval(interval);
        setError("Provisioning is taking longer than expected. Please refresh the page.");
        return;
      }
      pollProvision();
    }, 2000);
    pollIntervalRef.current = interval;
    return () => clearInterval(interval);
  }, [phase, workspaceId, pollProvision]);

  const handleRetryProvision = useCallback(async () => {
    if (retrying || !workspaceId) return;
    setRetrying(true);
    try {
      const result = await retryProvisionAction(workspaceId);
      if (result.ok) {
        setError(null);
        setCurrentStage(null);
        completedRef.current = false;
        pollStartRef.current = Date.now();
        failureCountRef.current = 0;
      }
    } catch {
      setError("Unable to reach our servers. Please check your connection and try again.");
    }
    setRetrying(false);
  }, [workspaceId, retrying]);

  const handleKickProvision = useCallback(async () => {
    if (kickingProvision || !workspaceId) return;
    setKickingProvision(true);
    try {
      const result = await verifyAndKickProvision(workspaceId);
      if (result.ok) {
        pendingSinceRef.current = null;
        setPendingStale(false);
        failureCountRef.current = 0;
      } else if (result.error) {
        setError(result.error);
      }
    } catch {
      setError("Unable to reach our servers. Please check your connection and try again.");
    }
    setKickingProvision(false);
  }, [workspaceId, kickingProvision]);

  // ─── Provider connection (after provisioning completes) ────────────────────

  const autoLoginRef = useRef<{ hash: string | null; type: string }>({ hash: null, type: "magiclink" });

  const handleProvisionComplete = useCallback(async (
    tokenHash: string | null,
    tokenType: string,
  ) => {
    autoLoginRef.current = { hash: tokenHash, type: tokenType };
    setCurrentStage("connecting_provider");
    setPhase("connecting_provider");

    if (isOAuthProvider) {
      // OAuth providers need interactive flow — handled by the OAuth UI below
      return;
    }

    // API-key providers — connect automatically with retry
    // The gateway command runner may still be starting up
    setError(null);
    const maxRetries = 10;
    for (let i = 0; i < maxRetries; i++) {
      const r = await connectProvider(providerId, providerApiKey);
      if (r.ok) {
        handleProviderConnected();
        return;
      }
      // If it's a real validation error (bad key), don't retry
      if (r.error?.includes("Invalid API key")) {
        setError(r.error);
        return;
      }
      // Otherwise wait and retry (gateway may not be ready)
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        setError(r.error ?? "Failed to connect provider");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, providerApiKey, isOAuthProvider]);

  const handleProviderConnected = useCallback(() => {
    setCurrentStage("creating_agent");
    setPhase("creating_agent");
    createAgent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── OAuth flow (during provider connection phase) ─────────────────────────

  const handleStartOAuth = useCallback(async () => {
    setOauthPhase({ kind: "starting" });
    setOauthError(null);
    setPasted("");

    const mode: "oauth_paste" | "device_code" =
      providerEntry?.authShape === "device_code" ? "device_code" : "oauth_paste";

    const r = await startOAuthFlow(providerId, mode);
    if (!r.ok || !r.data) {
      setOauthError(r.error ?? "Failed to start sign-in");
      setOauthPhase({ kind: "idle" });
      return;
    }

    const commandId = r.data.commandId;
    // Start in waiting_for_gateway — the command runner may not be online yet
    setOauthPhase({ kind: "waiting_for_gateway", commandId });

    if (oauthPollRef.current) clearInterval(oauthPollRef.current);
    oauthPollRef.current = setInterval(async () => {
      const poll = await pollCommandState(commandId);
      if (!poll.ok || !poll.data) return;

      // Command still pending — gateway hasn't picked it up yet
      if (poll.data.status === "pending") return;

      // Command is now running — transition to interactive
      setOauthPhase((prev) => {
        if (prev.kind === "waiting_for_gateway") {
          return { kind: "interactive", commandId, state: { stage: "starting" } };
        }
        return prev;
      });

      const cs = (poll.data.payload?.connection_state ?? null) as ConnectionCommandState | null;
      if (cs) {
        setOauthPhase((prev) => {
          if (prev.kind !== "interactive") return prev;
          return { ...prev, state: cs };
        });
      }

      if (poll.data.status === "done") {
        if (oauthPollRef.current) clearInterval(oauthPollRef.current);
        setOauthPhase({ kind: "done" });
        await saveOAuthProvider(providerId);
        handleProviderConnected();
      } else if (poll.data.status === "failed") {
        if (oauthPollRef.current) clearInterval(oauthPollRef.current);
        setOauthError(
          (poll.data.payload?.error_message as string) ?? "Sign-in failed.",
        );
        setOauthPhase({ kind: "idle" });
      }
    }, 1500);
  }, [providerId, providerEntry, handleProviderConnected]);

  const handleOAuthPaste = useCallback(async () => {
    if (oauthPhase.kind !== "interactive" || !pasted.trim()) return;
    setSubmittingPaste(true);
    const r = await submitOAuthPaste(oauthPhase.commandId, pasted.trim());
    setSubmittingPaste(false);
    if (!r.ok) {
      setOauthError(r.error ?? "Failed to submit code");
    }
  }, [oauthPhase, pasted]);

  async function copyToClipboard(value: string, key: "url" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch { /* noop */ }
  }

  // ─── Agent creation (after provider connected) ─────────────────────────────

  const createAgent = useCallback(async () => {
    setError(null);

    const r = await createFirstAgent({
      name: agentName,
      emoji: agentEmoji,
      templateBranch: agentTemplateBranch,
    });

    if (!r.ok || !r.data) {
      setError(r.error ?? "Failed to create agent");
      return;
    }

    const { agentId, provisionCommandId } = r.data;
    onPatch({ agentId, agentName, agentEmoji });

    if (provisionCommandId) {
      const startedAt = Date.now();
      const interval = setInterval(async () => {
        const status = await pollAgentProvisionStatus(provisionCommandId);
        if (status === "completed" || Date.now() - startedAt > 120_000) {
          clearInterval(interval);
          finalize(agentId);
        } else if (status === "error") {
          clearInterval(interval);
          // Still finalize — agent exists, provisioning can be retried from dashboard
          finalize(agentId);
        }
      }, 3000);
    } else {
      finalize(agentId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentName, agentEmoji, agentTemplateBranch, onPatch]);

  // ─── Finalize ──────────────────────────────────────────────────────────────

  const finalize = useCallback(async (agentId: string) => {
    setCurrentStage("complete");
    setPhase("complete");

    // Auto-login
    let needsManualLogin = false;
    const { hash, type } = autoLoginRef.current;
    if (hash) {
      const result = await verifyAutoLogin(hash, type as "magiclink" | "email");
      if (!result.ok) {
        const hostedEmailVal = await getHostedEmail().catch(() => null);
        if (hostedEmailVal) {
          await sendFreshLoginLink(hostedEmailVal).catch(() => {});
        }
        needsManualLogin = true;
      }
    }

    setTimeout(() => onComplete({ needsManualLogin, agentId }), 1200);
  }, [onComplete]);

  // ─── Computed state ────────────────────────────────────────────────────────

  const isPending = subscriptionStatus === "pending" || subscriptionStatus === null;
  const current = stageIdx(currentStage);
  const isComplete = currentStage === "complete";

  const progressPercent = phase === "summary"
    ? 0
    : isPending && phase === "provisioning"
      ? 0
      : isComplete
        ? 100
        : current >= 0
          ? Math.round(((current + 0.5) / PROVISION_STAGES.length) * 100)
          : 0;

  // ─── Render: Summary phase ─────────────────────────────────────────────────

  if (phase === "summary") {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
            Ready to launch
          </h1>
          <p className="text-[14px] text-muted-foreground">
            Here&apos;s what we&apos;ll set up for you.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">Workspace</span>
            <span className="font-medium">{workspaceName}</span>
          </div>
          {preset && (
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">Focus</span>
              <span className="font-medium">{preset.emoji} {preset.label}</span>
            </div>
          )}
          {providerEntry && (
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">AI</span>
              <span className="font-medium">{providerEntry.displayName}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">Agent</span>
            <span className="font-medium">{agentEmoji} {agentName}</span>
          </div>
          <div className="border-t border-border/40 pt-3 flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium">Pro &mdash; $30/mo</span>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0">{error}</span>
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleCheckout}
            disabled={paymentLoading}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
              paymentLoading
                ? "cursor-wait bg-muted text-muted-foreground/50"
                : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
            )}
          >
            {paymentLoading ? "Redirecting to Stripe..." : (
              <>
                Launch workspace
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
          <p className="text-[11px] text-muted-foreground/60">
            Secure checkout via Stripe. Cancel anytime.
          </p>
        </div>
      </div>
    );
  }

  // ─── Render: Provisioning + provider + agent phases ────────────────────────

  const title = isComplete
    ? "Your workspace is live"
    : phase === "creating_agent"
      ? "Creating your agent"
      : phase === "connecting_provider"
        ? isOAuthProvider && oauthPhase.kind === "waiting_for_gateway"
          ? "Almost there"
          : isOAuthProvider && oauthPhase.kind !== "done"
            ? `Sign in with ${providerEntry?.displayName ?? "your provider"}`
            : "Connecting AI provider"
        : isPending
          ? "Confirming payment"
          : "Setting up your workspace";

  const subtitle = isComplete
    ? "Redirecting you now..."
    : phase === "connecting_provider" && isOAuthProvider && oauthPhase.kind === "waiting_for_gateway"
      ? "Your workspace is starting up. The sign-in page will appear shortly."
      : phase === "connecting_provider" && isOAuthProvider && oauthPhase.kind === "idle"
        ? "Your workspace is ready. Connect your AI provider to continue."
        : isPending
          ? "Waiting for payment confirmation from Stripe."
          : "This usually takes about a minute.";

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-4">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-colors duration-500",
            isComplete
              ? "bg-status-success/10 text-status-success"
              : isPending && phase === "provisioning"
                ? "bg-status-warning/10 text-status-warning"
                : "bg-foreground text-background",
          )}
        >
          {isComplete ? (
            <Check className="h-[18px] w-[18px]" />
          ) : isPending && phase === "provisioning" ? (
            <CreditCard className="h-[18px] w-[18px]" />
          ) : (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          )}
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[420px]">
        {/* Progress bar */}
        <div className="mb-6 h-[3px] overflow-hidden rounded-full bg-border/60">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              isComplete ? "bg-status-success" : isPending ? "bg-status-warning" : "bg-foreground",
            )}
            style={{ width: `${Math.max(progressPercent, isPending ? 5 : 0)}%` }}
          />
        </div>

        {/* Error state */}
        {error && phase !== "connecting_provider" && (
          <div className="mb-4 space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 space-y-1">
                <p className="text-[13px] font-medium text-destructive">Something went wrong</p>
                <p className="text-[12px] text-destructive/80">{friendlyError(error)}</p>
                <p className="text-[11px] text-destructive/60 pt-1">
                  Contact support@yourhq.ai if this persists.
                </p>
              </div>
            </div>
            <button
              onClick={handleRetryProvision}
              disabled={retrying}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-[13px] font-medium text-foreground transition-all hover:bg-accent active:scale-[0.98] disabled:opacity-50"
            >
              <RotateCw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} />
              {retrying ? "Retrying…" : "Try again"}
            </button>
          </div>
        )}

        {/* Provider connection error (allows re-entry) */}
        {error && phase === "connecting_provider" && !isOAuthProvider && (
          <div className="mb-4 space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 space-y-1">
                <p className="text-[13px] font-medium text-destructive">Could not connect provider</p>
                <p className="text-[12px] text-destructive/80">{friendlyError(error)}</p>
              </div>
            </div>
            <button
              onClick={async () => {
                setError(null);
                const r = await connectProvider(providerId, providerApiKey);
                if (!r.ok) {
                  setError(r.error ?? "Failed to connect provider");
                } else {
                  handleProviderConnected();
                }
              }}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-[13px] font-medium text-foreground transition-all hover:bg-accent active:scale-[0.98]"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry
            </button>
            <button
              onClick={() => {
                // Skip provider — go straight to agent creation
                handleProviderConnected();
              }}
              className="flex h-9 w-full items-center justify-center text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip — I&apos;ll configure this later
            </button>
          </div>
        )}

        {/* OAuth interactive flow (during connecting_provider phase) */}
        {phase === "connecting_provider" && isOAuthProvider && !error && (
          <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden p-5 space-y-4">
            {oauthPhase.kind === "idle" && (
              <div className="space-y-3">
                <p className="text-[12px] text-muted-foreground">
                  Click below to sign in with {providerEntry?.displayName ?? "your provider"}.
                </p>
                {oauthError && (
                  <p className="text-[12px] text-destructive">{oauthError}</p>
                )}
                <button
                  type="button"
                  onClick={handleStartOAuth}
                  className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-foreground text-background px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-foreground/90"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Sign in with {providerEntry?.displayName}
                </button>
              </div>
            )}

            {oauthPhase.kind === "starting" && (
              <div className="flex items-center gap-2 py-3 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting sign-in flow…
              </div>
            )}

            {oauthPhase.kind === "waiting_for_gateway" && (
              <div className="space-y-2 py-2">
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Waiting for your agent runtime to finish starting up…
                </div>
                <p className="text-[11px] text-muted-foreground/60">
                  This usually takes 30–60 seconds. The sign-in page will appear automatically.
                </p>
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
                          onClick={() => copyToClipboard((oauthPhase.state as { url: string }).url, "url")}
                          className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title="Copy URL"
                        >
                          {copied === "url" ? <CheckCircle2 className="h-3.5 w-3.5 text-status-success" /> : <Copy className="h-3.5 w-3.5" />}
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
                            onClick={() => copyToClipboard((oauthPhase.state as { verificationCode?: string }).verificationCode ?? "", "code")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          >
                            {copied === "code" ? <CheckCircle2 className="h-3 w-3 text-status-success" /> : <Copy className="h-3 w-3" />}
                            {copied === "code" ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Waiting for sign-in to complete…
                    </div>

                    {providerEntry?.authShape !== "device_code" && (
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
                            onClick={handleOAuthPaste}
                            className={cn(
                              "shrink-0 inline-flex h-9 items-center rounded-lg px-3 text-[12px] font-medium transition-colors",
                              !pasted.trim() || submittingPaste
                                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                                : "bg-foreground text-background hover:bg-foreground/90",
                            )}
                          >
                            {submittingPaste ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit"}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {oauthError && (
                  <p className="text-[12px] text-destructive">{oauthError}</p>
                )}
              </div>
            )}

            {oauthPhase.kind === "done" && (
              <div className="flex items-center gap-2 text-[12px] text-status-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {providerEntry?.displayName} connected
              </div>
            )}
          </div>
        )}

        {/* Pending payment state */}
        {phase === "provisioning" && !error && isPending && (
          <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-status-warning" />
              <span className="text-[13px] font-medium text-foreground">
                Waiting for payment confirmation...
              </span>
            </div>
            {pendingStale ? (
              <div className="space-y-3 pl-7">
                <p className="text-[12px] text-muted-foreground">
                  We haven&apos;t received confirmation from Stripe yet. If you completed
                  payment, click below and we&apos;ll verify it directly.
                </p>
                <button
                  onClick={handleKickProvision}
                  disabled={kickingProvision}
                  className="flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-foreground transition-all hover:bg-accent active:scale-[0.98] disabled:opacity-50"
                >
                  <RotateCw className={cn("h-3 w-3", kickingProvision && "animate-spin")} />
                  {kickingProvision ? "Verifying…" : "Verify payment"}
                </button>
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground pl-7">
                This usually takes a few seconds. This page will update automatically.
              </p>
            )}
          </div>
        )}

        {/* Stage list (active during provisioning + provider + agent phases) */}
        {!error && !isPending && phase !== "connecting_provider" && (
          <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
            <div className="divide-y divide-border/40">
              {PROVISION_STAGES.map((stage, i) => {
                const done = i < current || isComplete;
                const active = i === current && !isComplete;
                return (
                  <div
                    key={stage.key}
                    className={cn(
                      "flex items-center gap-3 px-5 py-3 transition-colors duration-300",
                      active && "bg-accent/30",
                    )}
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {done ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-status-success/10">
                          <Check className="h-3 w-3 text-status-success" />
                        </div>
                      ) : active ? (
                        <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-border" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[13px] transition-colors duration-300",
                        done
                          ? "text-muted-foreground"
                          : active
                            ? "text-foreground font-medium"
                            : "text-muted-foreground/40",
                      )}
                    >
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
