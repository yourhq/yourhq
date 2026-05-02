"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Power,
  RefreshCw,
  Download,
  Zap,
} from "lucide-react";
import { PageHeader, PageSection } from "@/components/shared/page-header";
import { enqueueAgentCommand } from "@/app/dashboard/agents/actions";
import type { CommandAction } from "@/lib/agents/types";
import { COMMAND_ACTION_LABELS } from "@/lib/agents/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SYSTEM_ACTIONS: {
  action: CommandAction;
  label: string;
  description: string;
  icon: typeof Power;
}[] = [
  {
    action: "restart_gateway",
    label: "Restart Gateway",
    description: "Restart the agent runtime. All agents will briefly disconnect.",
    icon: Power,
  },
  {
    action: "update_gateway",
    label: "Update Gateway",
    description: "Pull latest images and restart. Agents will briefly disconnect.",
    icon: Download,
  },
  {
    action: "update_all",
    label: "Update All Agents",
    description: "Git pull latest code for all deployed agents.",
    icon: Download,
  },
  {
    action: "restart_dispatcher",
    label: "Restart Dispatcher",
    description: "Restart the inbox dispatcher service.",
    icon: RefreshCw,
  },
];

export default function ActionsSettingsPage() {
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<typeof SYSTEM_ACTIONS[number] | null>(null);

  const handleEnqueue = useCallback(async (action: CommandAction) => {
    setSubmitting(action);
    try {
      await enqueueAgentCommand({ action });
      toast.success(`${COMMAND_ACTION_LABELS[action]} queued`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to enqueue command");
    } finally {
      setSubmitting(null);
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Zap className="h-4 w-4" />}
        title="Actions"
        description="Gateway controls and infrastructure operations."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl">
          <PageSection title="System actions" description="These affect all agents on the gateway.">
            <div className="space-y-1.5">
              {SYSTEM_ACTIONS.map((sa) => {
                const Icon = sa.icon;
                const isSubmitting = submitting === sa.action;
                return (
                  <button
                    key={sa.action}
                    onClick={() => setConfirmAction(sa)}
                    disabled={submitting !== null}
                    className="group flex items-center gap-3 w-full rounded-md border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-accent/60 disabled:opacity-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-foreground">{sa.label}</div>
                      <div className="text-[12px] text-muted-foreground">{sa.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </PageSection>
        </div>
      </div>

      {confirmAction && (
        <AlertDialog open onOpenChange={(o) => !o && setConfirmAction(null)}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmAction.label}</AlertDialogTitle>
              <AlertDialogDescription>{confirmAction.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="sm" onClick={() => setConfirmAction(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                size="sm"
                onClick={() => {
                  handleEnqueue(confirmAction.action);
                  setConfirmAction(null);
                }}
              >
                {confirmAction.label}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
