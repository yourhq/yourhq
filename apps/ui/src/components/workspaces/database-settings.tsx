"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Star,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AddWorkspaceDialog } from "./add-workspace-dialog";
import { cn } from "@/lib/utils";

export interface DatabaseSettingsWorkspace {
  id: string;
  label: string;
  emoji: string;
  url: string;
  isDefault: boolean;
  createdAt: string;
}

interface Props {
  activeWorkspaceId: string | null;
  workspaces: DatabaseSettingsWorkspace[];
}

export function DatabaseSettings({ activeWorkspaceId, workspaces }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<DatabaseSettingsWorkspace | null>(null);
  const [rotating, setRotating] = useState<DatabaseSettingsWorkspace | null>(null);
  const [deleting, setDeleting] = useState<DatabaseSettingsWorkspace | null>(null);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Database className="h-4 w-4" />}
        title="Database"
        description="Database connection for this workspace."
        primaryAction={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add workspace
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-5">
          {workspaces.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 px-6 py-10 text-center">
              <p className="text-body text-muted-foreground">
                No workspaces connected yet.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add workspace
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border/60 bg-card">
              {workspaces.map((w, idx) => {
                const isActive = w.id === activeWorkspaceId;
                const canDelete = !isActive || workspaces.length === 1;
                return (
                  <div
                    key={w.id}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5",
                      idx > 0 && "border-t border-border/50",
                      isActive && "bg-accent/30",
                    )}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-[15px]">
                      {w.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-[13px] font-medium text-foreground">
                          {w.label}
                        </div>
                        {isActive && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-success" title="Active" />
                        )}
                        {w.isDefault && !isActive && (
                          <Star className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                        )}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground/70 font-mono">
                        {w.url.replace(/^https?:\/\//, "")}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                          aria-label="Workspace actions"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => setEditing(w)} className="gap-2">
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setRotating(w)} className="gap-2">
                          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                          Rotate service key
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setDeleting(w)}
                          disabled={!canDelete}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {!canDelete ? "Disconnect (switch first)" : "Disconnect"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-3 text-[11px] text-muted-foreground/60">
            Active workspaces are marked with a green dot. The default workspace is used on first visit.
          </p>
        </div>
      </div>

      <AddWorkspaceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => router.refresh()}
      />

      {editing && (
        <EditConnectionDialog
          workspace={editing}
          onClose={(refresh) => {
            setEditing(null);
            if (refresh) router.refresh();
          }}
        />
      )}

      {rotating && (
        <RotateKeyDialog
          workspace={rotating}
          onClose={(refresh) => {
            setRotating(null);
            if (refresh) router.refresh();
          }}
        />
      )}

      {deleting && (
        <DisconnectWorkspaceDialog
          workspace={deleting}
          isLast={workspaces.length === 1}
          onClose={(refresh) => {
            setDeleting(null);
            if (refresh) router.refresh();
          }}
          onLastDeleted={() => {
            window.location.href = "/onboarding";
          }}
        />
      )}
    </div>
  );
}

// ── Edit (label + emoji) ────────────────────────────────────────────────

function EditConnectionDialog({
  workspace,
  onClose,
}: {
  workspace: DatabaseSettingsWorkspace;
  onClose: (refresh: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const label = String(fd.get("label") ?? "").trim();
    const emoji = String(fd.get("emoji") ?? "🏠").trim();
    const makeDefault = fd.get("makeDefault") === "on";
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, emoji, makeDefault }),
      });
      if (!res.ok) {
        setError(`Save failed (${res.status})`);
        return;
      }
      onClose(true);
    });
  };

  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose(false)}>
      <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-sm p-0 gap-0">
        <ResponsiveDialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <ResponsiveDialogTitle className="text-heading">Edit workspace</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-caption text-muted-foreground">
            Rename or change the icon. Use Rotate for the service role key.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form onSubmit={onSubmit}>
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-[56px_1fr] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-emoji" className="text-[12px]">Icon</Label>
                <Input
                  id="edit-emoji"
                  name="emoji"
                  defaultValue={workspace.emoji}
                  maxLength={8}
                  className="text-center text-base"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-label" className="text-[12px]">Name</Label>
                <Input
                  id="edit-label"
                  name="label"
                  defaultValue={workspace.label}
                  maxLength={80}
                  required
                  autoFocus
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-foreground">
              <input
                type="checkbox"
                name="makeDefault"
                defaultChecked={workspace.isDefault}
                disabled={workspace.isDefault}
                className="rounded border-border/60"
              />
              <span>Make default workspace</span>
            </label>
            {error && (
              <p className="text-[12px] text-destructive">{error}</p>
            )}
          </div>
          <ResponsiveDialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
            <Button variant="ghost" type="button" size="sm" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ── Rotate service role key ─────────────────────────────────────────────

function RotateKeyDialog({
  workspace,
  onClose,
}: {
  workspace: DatabaseSettingsWorkspace;
  onClose: (refresh: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const serviceRoleKey = String(fd.get("serviceRoleKey") ?? "").trim();
    if (serviceRoleKey.length < 20) {
      setError("Key looks too short — paste the full JWT.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceRoleKey }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Rotate failed (${res.status})`);
        return;
      }
      onClose(true);
    });
  };

  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose(false)}>
      <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-sm p-0 gap-0">
        <ResponsiveDialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <ResponsiveDialogTitle className="text-heading">Rotate service role key</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-caption text-muted-foreground">
            Paste the new key from Supabase → Project Settings → API. Revoke the old one in Supabase separately once you&apos;ve confirmed the new one works.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form onSubmit={onSubmit}>
          <div className="px-5 py-4 space-y-2">
            <Label htmlFor="rotate-key" className="text-[12px]">
              New service role key
            </Label>
            <Input
              id="rotate-key"
              name="serviceRoleKey"
              type="password"
              placeholder="eyJhbGciOi…"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-[12px]"
              required
              autoFocus
            />
            {error && (
              <p className="text-[12px] text-destructive">{error}</p>
            )}
          </div>
          <ResponsiveDialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
            <Button variant="ghost" type="button" size="sm" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Rotating…
                </>
              ) : (
                "Rotate"
              )}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ── Disconnect ──────────────────────────────────────────────────────────

function DisconnectWorkspaceDialog({
  workspace,
  isLast,
  onClose,
  onLastDeleted,
}: {
  workspace: DatabaseSettingsWorkspace;
  isLast: boolean;
  onClose: (refresh: boolean) => void;
  onLastDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    startTransition(async () => {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        return;
      }
      if (isLast) {
        onLastDeleted();
        return;
      }
      onClose(true);
    });
  };

  return (
    <ConfirmDialog
      open
      onCancel={() => onClose(false)}
      title={`Disconnect "${workspace.label}"?`}
      description={
        isLast
          ? "This is your only workspace. Disconnecting it will return you to the onboarding flow. Your database is not touched — you can reconnect later with the same URL and keys."
          : "Removes the workspace from this machine's registry. Your database is not touched — you can reconnect later with the same URL and keys."
      }
      confirmLabel={pending ? "Disconnecting…" : "Disconnect"}
      tone="destructive"
      onConfirm={onConfirm}
    />
  );
}
