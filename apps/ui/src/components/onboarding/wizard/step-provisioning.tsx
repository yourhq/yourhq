"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Sparkles, Check, Loader2, AlertCircle, CreditCard, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { pollProvisionStatus, retryProvisionAction, verifyAndKickProvision } from "./hosted-actions";

interface Stage {
  key: string;
  label: string;
}

const STAGES: Stage[] = [
  { key: "creating_project", label: "Creating database" },
  { key: "applying_schema", label: "Applying schema" },
  { key: "creating_user", label: "Setting up your workspace" },
  { key: "starting_sandbox", label: "Starting agent runtime" },
  { key: "waiting_for_gateway", label: "Connecting gateway" },
  { key: "complete", label: "Ready" },
];

const STAGE_MAP: Record<string, number> = {
  creating_project: 0,
  waiting_for_project: 0,
  fetching_keys: 0,
  applying_schema: 1,
  creating_user: 2,
  starting_sandbox: 3,
  waiting_for_gateway: 4,
  complete: 5,
};

function stageIndex(stage: string | null): number {
  if (!stage) return -1;
  return STAGE_MAP[stage] ?? -1;
}

function friendlyError(raw: string): string {
  if (raw.includes("project creation failed")) return "We couldn't create your database right now. Our team has been notified.";
  if (raw.includes("did not become ready")) return "Your database is taking longer than expected to initialize.";
  if (raw.includes("Failed to fetch")) return "We ran into a temporary issue connecting to our infrastructure.";
  if (raw.includes("Auth user creation failed")) return "We had trouble setting up your account.";
  if (raw.includes("Gateway did not register")) return "Your agent runtime started but took too long to connect. This is usually temporary.";
  if (raw.includes("setup failed")) return "Workspace initialization didn't complete.";
  return "Something unexpected happened during setup. Our team has been notified.";
}

const MAX_POLL_MS = 5 * 60 * 1000;
const PENDING_TIMEOUT_MS = 90_000;
const MAX_CONSECUTIVE_FAILURES = 5;

interface StepProvisioningProps {
  workspaceId: string;
  onComplete: (tokenHash: string | null, tokenType: string) => void;
}

export function StepProvisioning({ workspaceId, onComplete }: StepProvisioningProps) {
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [pendingStale, setPendingStale] = useState(false);
  const [kickingProvision, setKickingProvision] = useState(false);
  const pendingSinceRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const pollStartRef = useRef<number>(0);
  const failureCountRef = useRef(0);

  const poll = useCallback(async () => {
    if (completedRef.current) return;

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
      onComplete(status.auto_login_token_hash, status.auto_login_type);
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
  }, [workspaceId, onComplete]);

  const handleRetry = useCallback(async () => {
    if (retrying) return;
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
    if (kickingProvision) return;
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

  useEffect(() => {
    if (pollStartRef.current === 0) pollStartRef.current = Date.now();
    poll();
    const interval = setInterval(() => {
      if (Date.now() - pollStartRef.current > MAX_POLL_MS) {
        clearInterval(interval);
        setError("Provisioning is taking longer than expected. Please refresh the page.");
        return;
      }
      poll();
    }, 2000);
    return () => clearInterval(interval);
  }, [poll]);

  const isPending = subscriptionStatus === "pending" || subscriptionStatus === null;
  const current = stageIndex(currentStage);
  const isComplete = currentStage === "complete";

  const progressPercent = isPending
    ? 0
    : isComplete
      ? 100
      : current >= 0
        ? Math.round(((current + 0.5) / STAGES.length) * 100)
        : 0;

  const title = isComplete
    ? "Your workspace is ready"
    : isPending
      ? "Confirming payment"
      : "Setting up your workspace";

  const subtitle = isComplete
    ? "Finishing up..."
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
              : isPending
                ? "bg-status-warning/10 text-status-warning"
                : "bg-foreground text-background",
          )}
        >
          {isComplete ? (
            <Check className="h-[18px] w-[18px]" />
          ) : isPending ? (
            <CreditCard className="h-[18px] w-[18px]" />
          ) : (
            <Sparkles className="h-[18px] w-[18px]" />
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
        <div className="mb-6 h-[3px] overflow-hidden rounded-full bg-border/60">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              isComplete ? "bg-status-success" : isPending ? "bg-status-warning" : "bg-foreground",
            )}
            style={{ width: `${Math.max(progressPercent, isPending ? 5 : 0)}%` }}
          />
        </div>

        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          {error ? (
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 space-y-1">
                  <p className="text-[13px] font-medium text-destructive">
                    Something went wrong
                  </p>
                  <p className="text-[12px] text-destructive/80">{friendlyError(error)}</p>
                  <p className="text-[11px] text-destructive/60 pt-1">
                    Contact support@yourhq.ai if this persists.
                  </p>
                </div>
              </div>
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-[13px] font-medium text-foreground transition-all hover:bg-accent active:scale-[0.98] disabled:opacity-50"
              >
                <RotateCw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} />
                {retrying ? "Retrying…" : "Try again"}
              </button>
            </div>
          ) : isPending ? (
            <div className="p-6 space-y-4">
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
          ) : (
            <div className="divide-y divide-border/40">
              {STAGES.map((stage, i) => {
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
          )}
        </div>
      </div>
    </div>
  );
}
