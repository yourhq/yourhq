"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FolderKanban,
  Check,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AddProjectDialog } from "./add-project-dialog";
import { cn } from "@/lib/utils";

export interface ProjectsSettingsProject {
  id: string;
  label: string;
  emoji: string;
  url: string;
  isDefault: boolean;
  createdAt: string;
}

interface Props {
  activeProjectId: string | null;
  projects: ProjectsSettingsProject[];
}

export function ProjectsSettings({ activeProjectId, projects }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectsSettingsProject | null>(null);
  const [rotating, setRotating] = useState<ProjectsSettingsProject | null>(null);
  const [deleting, setDeleting] = useState<ProjectsSettingsProject | null>(null);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<FolderKanban className="h-4 w-4" />}
        title="Projects"
        description="Connect, edit, and switch between Supabase projects. Each project is fully isolated."
        primaryAction={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add project
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-3xl p-5 space-y-2">
          {projects.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No projects yet. Click &quot;Add project&quot; to connect one.
            </div>
          ) : (
            projects.map((p) => {
              const isActive = p.id === activeProjectId;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md border bg-card p-4",
                    isActive
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/60",
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-lg">
                    {p.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-[13px] font-medium text-foreground">
                        {p.label}
                      </div>
                      {isActive && (
                        <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-primary">
                          <Check className="h-3 w-3" />
                          Active
                        </span>
                      )}
                      {p.isDefault && !isActive && (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground font-mono">
                      {p.url}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditing(p)}
                      title="Edit label + emoji"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setRotating(p)}
                      title="Rotate service role key"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setDeleting(p)}
                      disabled={isActive}
                      title={
                        isActive
                          ? "Switch to another project first"
                          : "Delete project"
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <AddProjectDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => router.refresh()}
      />

      {editing && (
        <EditProjectDialog
          project={editing}
          onClose={(refresh) => {
            setEditing(null);
            if (refresh) router.refresh();
          }}
        />
      )}

      {rotating && (
        <RotateKeyDialog
          project={rotating}
          onClose={(refresh) => {
            setRotating(null);
            if (refresh) router.refresh();
          }}
        />
      )}

      {deleting && (
        <DeleteProjectDialog
          project={deleting}
          onClose={(refresh) => {
            setDeleting(null);
            if (refresh) router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Edit (label + emoji) ────────────────────────────────────────────────

function EditProjectDialog({
  project,
  onClose,
}: {
  project: ProjectsSettingsProject;
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
      const res = await fetch(`/api/projects/${project.id}`, {
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
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Update the label and emoji. URL and keys are unchanged — use Rotate
            to replace the service role key.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-[72px_1fr] gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-emoji">Icon</Label>
              <Input
                id="edit-emoji"
                name="emoji"
                defaultValue={project.emoji}
                maxLength={8}
                className="text-center text-xl"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-label">Name</Label>
              <Input
                id="edit-label"
                name="label"
                defaultValue={project.label}
                maxLength={80}
                required
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="makeDefault"
              defaultChecked={project.isDefault}
              disabled={project.isDefault}
            />
            <span>Default project</span>
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Rotate service role key ─────────────────────────────────────────────

function RotateKeyDialog({
  project,
  onClose,
}: {
  project: ProjectsSettingsProject;
  onClose: (refresh: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const serviceRoleKey = String(fd.get("serviceRoleKey") ?? "").trim();
    if (serviceRoleKey.length < 20) {
      setError("Key looks too short — paste the full service role JWT.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/projects/${project.id}`, {
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
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate service role key</DialogTitle>
          <DialogDescription>
            Paste the new service role key from Supabase → Project Settings →
            API. The old key stays valid in Supabase until you revoke it
            separately there.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rotate-key">New service role key</Label>
            <Input
              id="rotate-key"
              name="serviceRoleKey"
              type="password"
              placeholder="eyJ..."
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => onClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Rotating…
                </>
              ) : (
                "Rotate"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete ───────────────────────────────────────────────────────────────

function DeleteProjectDialog({
  project,
  onClose,
}: {
  project: ProjectsSettingsProject;
  onClose: (refresh: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    startTransition(async () => {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert("Delete failed");
        return;
      }
      onClose(true);
    });
  };

  return (
    <ConfirmDialog
      open
      onCancel={() => onClose(false)}
      title={`Delete "${project.label}"?`}
      description="Removes this project from the local registry. Your Supabase project is not touched. You can reconnect later with the same URL + keys."
      confirmLabel={pending ? "Deleting…" : "Delete"}
      tone="destructive"
      onConfirm={onConfirm}
    />
  );
}
