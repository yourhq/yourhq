"use client";

import { useEffect, useState, useCallback } from "react";
import { Sparkles, Check, Loader2, AlertCircle } from "lucide-react";
import { pollProvisionAction } from "./actions";

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

export function ProvisionStatus({ workspaceId }: { workspaceId: string }) {
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    const status = await pollProvisionAction(workspaceId);
    if (!status) return;
    if (status.provision_error) {
      setError(status.provision_error);
      return;
    }
    setCurrentStage(status.provision_stage);
  }, [workspaceId]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [poll]);

  const current = stageIndex(currentStage);
  const isComplete = currentStage === "complete";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-foreground/95 to-foreground/80 text-background shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="text-center">
            <h1 className="text-title">
              {isComplete ? "You're all set" : "Setting up your workspace"}
            </h1>
            <p className="text-caption text-muted-foreground">
              {isComplete
                ? "Check your email for a sign-in link."
                : "This usually takes about a minute."}
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border/60 bg-card p-6 shadow-sm">
          {error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-body text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="space-y-3">
              {STAGES.map((stage, i) => {
                const done = i < current || isComplete;
                const active = i === current && !isComplete;
                return (
                  <div key={stage.key} className="flex items-center gap-3">
                    {done ? (
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                    ) : active ? (
                      <Loader2 className="h-4 w-4 animate-spin text-foreground shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-border shrink-0" />
                    )}
                    <span
                      className={
                        done
                          ? "text-body text-muted-foreground"
                          : active
                            ? "text-body text-foreground font-medium"
                            : "text-body text-muted-foreground/50"
                      }
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
