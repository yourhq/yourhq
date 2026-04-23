"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";

interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (projectId: string) => void;
}

interface AddResult {
  ok: boolean;
  error?: string;
  hint?: string;
}

async function addProject(input: {
  label: string;
  emoji: string;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<AddResult> {
  // Validate first.
  const validateRes = await fetch("/api/projects/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: input.url,
      anonKey: input.anonKey,
      serviceRoleKey: input.serviceRoleKey,
    }),
  });
  if (!validateRes.ok) {
    const body = await validateRes.json().catch(() => ({}));
    return {
      ok: false,
      error: body.error ?? `Validation failed (${validateRes.status})`,
      hint: body.hint,
    };
  }

  // Save.
  const createRes = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!createRes.ok) {
    const body = await createRes.json().catch(() => ({}));
    return {
      ok: false,
      error: body.error ?? `Save failed (${createRes.status})`,
    };
  }
  return { ok: true };
}

export function AddProjectDialog({
  open,
  onOpenChange,
  onAdded,
}: AddProjectDialogProps) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AddResult | null>(null);
  const router = useRouter();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const input = {
      label: String(formData.get("label") ?? "").trim(),
      emoji: String(formData.get("emoji") ?? "🏠").trim(),
      url: String(formData.get("url") ?? "").trim(),
      anonKey: String(formData.get("anonKey") ?? "").trim(),
      serviceRoleKey: String(formData.get("serviceRoleKey") ?? "").trim(),
    };

    setResult(null);
    startTransition(async () => {
      const r = await addProject(input);
      setResult(r);
      if (r.ok) {
        onOpenChange(false);
        onAdded?.("");
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a Supabase project</DialogTitle>
          <DialogDescription>
            Connect another Supabase project. Each project is fully isolated
            — contacts, agents, tasks, and settings don&apos;t mix.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-[72px_1fr] gap-3">
            <div className="space-y-2">
              <Label htmlFor="add-emoji">Icon</Label>
              <Input
                id="add-emoji"
                name="emoji"
                defaultValue="🏠"
                maxLength={8}
                className="text-center text-xl"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-label">Name</Label>
              <Input
                id="add-label"
                name="label"
                placeholder="Secondary workspace"
                maxLength={80}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-url">Supabase URL</Label>
            <Input
              id="add-url"
              name="url"
              type="url"
              placeholder="https://xxxxxxxx.supabase.co"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-anon">Anon key</Label>
            <Input
              id="add-anon"
              name="anonKey"
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder="eyJ..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-service">Service role key</Label>
            <Input
              id="add-service"
              name="serviceRoleKey"
              type="password"
              spellCheck={false}
              autoComplete="off"
              placeholder="eyJ..."
              required
            />
            <p className="text-xs text-muted-foreground">
              Stored only on this machine in <code>/config/secrets.json</code>.
            </p>
          </div>

          {result && !result.ok && (
            <div className="flex gap-3 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <div className="space-y-1">
                <div className="text-destructive font-medium">{result.error}</div>
                {result.hint && (
                  <div className="text-muted-foreground text-xs">{result.hint}</div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Validating…
                </>
              ) : (
                "Add project"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
