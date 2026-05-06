"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
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

  const createRes = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!createRes.ok) {
    const body = await createRes.json().catch(() => ({}));
    return { ok: false, error: body.error ?? `Save failed (${createRes.status})` };
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
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md p-0 gap-0">
        <ResponsiveDialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <ResponsiveDialogTitle className="text-heading">Add a Supabase project</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-caption text-muted-foreground">
            Each project is fully isolated — contacts, agents, tasks, and settings don&apos;t mix.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col">
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-[56px_1fr] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="add-emoji" className="text-[12px]">
                  Icon
                </Label>
                <Input
                  id="add-emoji"
                  name="emoji"
                  defaultValue="🏠"
                  maxLength={8}
                  className="text-center text-base"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-label" className="text-[12px]">
                  Name
                </Label>
                <Input
                  id="add-label"
                  name="label"
                  placeholder="Secondary workspace"
                  maxLength={80}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-url" className="text-[12px]">
                Supabase URL
              </Label>
              <Input
                id="add-url"
                name="url"
                type="url"
                placeholder="https://xxxxxxxx.supabase.co"
                className="font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-anon" className="text-[12px]">
                Anon key
              </Label>
              <Input
                id="add-anon"
                name="anonKey"
                type="text"
                spellCheck={false}
                autoComplete="off"
                placeholder="eyJhbGciOi…"
                className="font-mono text-[12px]"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-service" className="text-[12px]">
                Service role key
              </Label>
              <Input
                id="add-service"
                name="serviceRoleKey"
                type="password"
                spellCheck={false}
                autoComplete="off"
                placeholder="eyJhbGciOi…"
                className="font-mono text-[12px]"
                required
              />
              <p className="text-[11px] text-muted-foreground/70">
                Stored on this machine in{" "}
                <span className="font-mono text-foreground/80">/config/secrets.json</span>.
              </p>
            </div>

            {result && !result.ok && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px]">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />
                <div className="min-w-0 space-y-0.5">
                  <div className="text-destructive">{result.error}</div>
                  {result.hint && (
                    <div className="text-muted-foreground text-[11px]">
                      {result.hint}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <ResponsiveDialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              size="sm"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending} size="sm">
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Validating…
                </>
              ) : (
                "Add project"
              )}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
