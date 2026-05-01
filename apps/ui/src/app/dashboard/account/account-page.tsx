"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import {
  listWorkspacesAction,
  cancelWorkspaceAction,
  getBillingPortalAction,
  logoutAction,
} from "./actions";

interface Workspace {
  id: string;
  label: string;
  emoji: string | null;
  subscription_status: string;
  e2b_sandbox_status: string;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "text-green-600" },
  provisioning: { label: "Setting up", className: "text-yellow-600" },
  canceling: { label: "Canceling", className: "text-orange-600" },
  canceled: { label: "Canceled", className: "text-muted-foreground" },
  pending: { label: "Pending", className: "text-muted-foreground" },
};

export function AccountPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    listWorkspacesAction().then((r) => {
      if (r.ok && r.workspaces) setWorkspaces(r.workspaces);
      else setError(r.error ?? "Failed to load.");
      setLoading(false);
    });
  }, []);

  async function handleCancel(id: string) {
    if (!confirm("Cancel this workspace? You'll have 30 days to reactivate.")) return;
    setCanceling(id);
    const r = await cancelWorkspaceAction(id);
    if (!r.ok) {
      setError(r.error ?? "Cancel failed.");
    } else {
      setWorkspaces((ws) =>
        ws.map((w) =>
          w.id === id ? { ...w, subscription_status: "canceling" } : w,
        ),
      );
    }
    setCanceling(null);
  }

  async function handleBilling() {
    const r = await getBillingPortalAction();
    if (r.ok && r.url) {
      window.open(r.url, "_blank");
    }
  }

  async function handleLogout() {
    await logoutAction();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-title">Account</h1>
        <p className="text-body text-muted-foreground">
          Manage your workspaces and billing.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-body text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-subtitle">Workspaces</h2>
          <Button variant="outline" size="sm" asChild>
            <a href="/signup">Add workspace</a>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : workspaces.length === 0 ? (
          <p className="text-body text-muted-foreground py-4">
            No workspaces found.
          </p>
        ) : (
          <div className="space-y-2">
            {workspaces.map((ws) => {
              const status = STATUS_LABELS[ws.subscription_status] ?? {
                label: ws.subscription_status,
                className: "text-muted-foreground",
              };
              return (
                <div
                  key={ws.id}
                  className="flex items-center justify-between rounded-md border border-border/60 bg-card px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{ws.emoji ?? "🏠"}</span>
                    <div>
                      <p className="text-body font-medium">{ws.label}</p>
                      <p className={`text-caption ${status.className}`}>
                        {status.label}
                      </p>
                    </div>
                  </div>
                  {ws.subscription_status === "active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={canceling === ws.id}
                      onClick={() => handleCancel(ws.id)}
                    >
                      {canceling === ws.id ? "Canceling…" : "Cancel"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-subtitle">Billing</h2>
        <Button variant="outline" onClick={handleBilling}>
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          Manage billing
        </Button>
      </div>

      <div className="border-t border-border/60 pt-6">
        <Button variant="ghost" onClick={handleLogout}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
