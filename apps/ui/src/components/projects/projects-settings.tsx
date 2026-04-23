"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FolderKanban,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add project
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-5">
          {projects.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 px-6 py-10 text-center">
              <p className="text-body text-muted-foreground">
                No projects yet.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add project
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border/60 bg-card">
              {projects.map((p, idx) => {
                const isActive = p.id === activeProjectId;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5",
                      idx > 0 && "border-t border-border/50",
                      isActive && "bg-accent/30",
                    )}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-[15px]">
                      {p.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-[13px] font-medium text-foreground">
                          {p.label}
                        </div>
                        {isActive && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Active" />
                        )}
                        {p.isDefault && !isActive && (
                          <Star className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                        )}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground/70 font-mono">
                        {p.url.replace(/^https?:\/\//, "")}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                          aria-label="Project actions"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => setEditing(p)} className="gap-2">
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setRotating(p)} className="gap-2">
                          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                          Rotate service key
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setDeleting(p)}
                          disabled={isActive}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {isActive ? "Delete (switch first)" : "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-3 text-[11px] text-muted-foreground/60">
            Active projects are marked with a green dot. The default project is used when no active-project cookie is set (e.g. first visit).
          </p>
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
      <DialogContent className="sm:max-w-sm p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <DialogTitle className="text-heading">Edit project</DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground">
            Rename or change the icon. Use Rotate for the service role key.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-[56px_1fr] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-emoji" className="text-[12px]">Icon</Label>
                <Input
                  id="edit-emoji"
                  name="emoji"
                  defaultValue={project.emoji}
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
                  defaultValue={project.label}
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
                defaultChecked={project.isDefault}
                disabled={project.isDefault}
                className="rounded border-border/60"
              />
              <span>Make default project</span>
            </label>
            {error && (
              <p className="text-[12px] text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
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
      setError("Key looks too short — paste the full JWT.");
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
      <DialogContent className="sm:max-w-sm p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <DialogTitle className="text-heading">Rotate service role key</DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground">
            Paste the new key from Supabase → Project Settings → API. Revoke the old one in Supabase separately once you&apos;ve confirmed the new one works.
          </DialogDescription>
        </DialogHeader>
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
          <DialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
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
      description="Removes the project from this machine's registry. Your Supabase project is not touched — you can reconnect later with the same URL and keys."
      confirmLabel={pending ? "Deleting…" : "Delete"}
      tone="destructive"
      onConfirm={onConfirm}
    />
  );
}
