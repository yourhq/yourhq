"use client";

import { useEffect, useState, useCallback } from "react";
import { Sparkles, Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { pollProvisionStatus } from "./hosted-actions";

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

interface StepProvisioningProps {
  workspaceId: string;
  onComplete: (autoLoginUrl: string | null) => void;
}

export function StepProvisioning({ workspaceId, onComplete }: StepProvisioningProps) {
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    const status = await pollProvisionStatus(workspaceId);
    if (!status) return;
    if (status.provision_error) {
      setError(status.provision_error);
      return;
    }
    setCurrentStage(status.provision_stage);
    if (status.provision_stage === "complete") {
      onComplete(status.auto_login_url);
    }
  }, [workspaceId, onComplete]);

  useEffect(() => {
    const startedAt = Date.now();
    poll();
    const interval = setInterval(() => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        clearInterval(interval);
        setError("Provisioning is taking longer than expected. Please refresh the page.");
        return;
      }
      poll();
    }, 2000);
    return () => clearInterval(interval);
  }, [poll]);

  const current = stageIndex(currentStage);
  const isComplete = currentStage === "complete";

  const progressPercent = isComplete
    ? 100
    : current >= 0
      ? Math.round(((current + 0.5) / STAGES.length) * 100)
      : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-4">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-colors duration-500",
            isComplete
              ? "bg-green-500/10 text-green-600"
              : "bg-foreground text-background",
          )}
        >
          {isComplete ? (
            <Check className="h-[18px] w-[18px]" />
          ) : (
            <Sparkles className="h-[18px] w-[18px]" />
          )}
        </div>
        <div className="text-center space-y-1">
          <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
            {isComplete ? "Your workspace is ready" : "Setting up your workspace"}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {isComplete
              ? "Finishing up..."
              : "This usually takes about a minute."}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[420px]">
        <div className="mb-6 h-[3px] overflow-hidden rounded-full bg-border/60">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              isComplete ? "bg-green-500" : "bg-foreground",
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          {error ? (
            <div className="p-6">
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
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/10">
                          <Check className="h-3 w-3 text-green-600" />
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
