"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  LogOut,
  Plus,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listWorkspacesAction,
  cancelWorkspaceAction,
  getBillingPortalAction,
  logoutAction,
} from "./actions";
import { PageHeader } from "@/components/shared/page-header";

interface Workspace {
  id: string;
  label: string;
  emoji: string | null;
  subscription_status: string;
  e2b_sandbox_status: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  active: {
    label: "Active",
    color: "text-green-600",
    bg: "bg-green-500/10",
  },
  provisioning: {
    label: "Setting up",
    color: "text-amber-600",
    bg: "bg-amber-500/10",
  },
  canceling: {
    label: "Canceling",
    color: "text-orange-600",
    bg: "bg-orange-500/10",
  },
  canceled: {
    label: "Canceled",
    color: "text-muted-foreground",
    bg: "bg-muted",
  },
  suspended: {
    label: "Suspended",
    color: "text-red-600",
    bg: "bg-red-500/10",
  },
  pending: {
    label: "Pending",
    color: "text-muted-foreground",
    bg: "bg-muted",
  },
};

export function AccountPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    listWorkspacesAction().then((r) => {
      if (r.ok && r.workspaces) setWorkspaces(r.workspaces);
      else setError(r.error ?? "Failed to load.");
      setLoading(false);
    });
  }, []);

  async function handleCancel(id: string, label: string) {
    if (
      !confirm(
        `Cancel "${label}"? You'll have 30 days before it's permanently deleted.`,
      )
    )
      return;
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
    setBillingLoading(true);
    const r = await getBillingPortalAction();
    if (r.ok && r.url) {
      window.open(r.url, "_blank");
    } else {
      setError(r.error ?? "Failed to open billing.");
    }
    setBillingLoading(false);
  }

  async function handleLogout() {
    await logoutAction();
    router.push("/auth");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<CreditCard className="h-4 w-4" />}
        title="Account"
        description="Manage your workspaces and billing."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl p-5 space-y-8">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Workspaces */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-heading">Workspaces</h2>
              <a
                href="/signup"
                className="flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Add workspace
              </a>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : workspaces.length === 0 ? (
              <div className="rounded-lg border border-border/60 bg-card p-8 text-center">
                <p className="text-[13px] text-muted-foreground">
                  No workspaces found.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-card overflow-hidden divide-y divide-border/40">
                {workspaces.map((ws) => {
                  const status = STATUS_CONFIG[ws.subscription_status] ?? {
                    label: ws.subscription_status,
                    color: "text-muted-foreground",
                    bg: "bg-muted",
                  };
                  return (
                    <div
                      key={ws.id}
                      className="flex items-center justify-between px-4 py-3.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-muted/30 text-base">
                          {ws.emoji ?? "🏠"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium truncate">
                            {ws.label}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                status.bg,
                                status.color,
                              )}
                            >
                              {status.label}
                            </span>
                          </div>
                        </div>
                      </div>
                      {(ws.subscription_status === "active" || ws.subscription_status === "suspended") && (
                        <button
                          disabled={canceling === ws.id}
                          onClick={() => handleCancel(ws.id, ws.label)}
                          className="shrink-0 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-destructive/5 hover:text-destructive disabled:opacity-50"
                        >
                          {canceling === ws.id ? "Canceling…" : "Cancel"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Billing */}
          <section className="space-y-3">
            <h2 className="text-heading">Billing</h2>
            <div className="rounded-lg border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[13px] font-medium">Manage subscription</p>
                  <p className="text-[12px] text-muted-foreground">
                    Update payment method, view invoices, or change your plan.
                  </p>
                </div>
                <button
                  onClick={handleBilling}
                  disabled={billingLoading}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {billingLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ExternalLink className="h-3 w-3" />
                  )}
                  Open Stripe
                </button>
              </div>
            </div>
          </section>

          {/* Danger zone */}
          <section className="space-y-3 pb-8">
            <h2 className="text-heading">Session</h2>
            <div className="rounded-lg border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[13px] font-medium">Sign out</p>
                  <p className="text-[12px] text-muted-foreground">
                    Sign out of your current session on this device.
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-destructive/5 hover:text-destructive"
                >
                  <LogOut className="h-3 w-3" />
                  Sign out
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
