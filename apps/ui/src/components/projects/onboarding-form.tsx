"use client";

import { useState, useTransition } from "react";
import { connectProject, type OnboardingResult } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";

export function OnboardingForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OnboardingResult | null>(null);

  const onSubmit = (formData: FormData) => {
    setResult(null);
    startTransition(async () => {
      const r = await connectProject(formData);
      // connectProject redirects on success; we only see a return value on failure.
      setResult(r);
    });
  };

  return (
    <form action={onSubmit} className="space-y-5 bg-card border rounded-lg p-6">
      <div className="grid grid-cols-[80px_1fr] gap-3">
        <div className="space-y-2">
          <Label htmlFor="emoji">Icon</Label>
          <Input
            id="emoji"
            name="emoji"
            defaultValue="🏠"
            maxLength={8}
            className="text-center text-xl"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="label">Workspace name</Label>
          <Input
            id="label"
            name="label"
            placeholder="My workspace"
            maxLength={80}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="url">Supabase project URL</Label>
        <Input
          id="url"
          name="url"
          type="url"
          placeholder="https://xxxxxxxx.supabase.co"
          required
        />
        <p className="text-xs text-muted-foreground">
          From Supabase → Project Settings → API → Project URL
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="anonKey">Anon (public) key</Label>
        <Input
          id="anonKey"
          name="anonKey"
          type="text"
          spellCheck={false}
          autoComplete="off"
          placeholder="eyJ..."
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="serviceRoleKey">Service role key</Label>
        <Input
          id="serviceRoleKey"
          name="serviceRoleKey"
          type="password"
          spellCheck={false}
          autoComplete="off"
          placeholder="eyJ..."
          required
        />
        <p className="text-xs text-muted-foreground">
          Stored only on this machine in <code className="text-xs">/config/secrets.json</code> (mode 0600). Never sent to the browser.
        </p>
      </div>

      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Before clicking Connect, make sure you&apos;ve run the schema migration
          in your Supabase SQL editor:
        </p>
        <a
          href="https://github.com/yourhq/yourhq/blob/main/db/migrations/001_schema.sql"
          target="_blank"
          rel="noreferrer"
          className="text-xs inline-flex items-center gap-1 text-primary hover:underline"
        >
          db/migrations/001_schema.sql
          <ExternalLink className="h-3 w-3" />
        </a>
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

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Validating…
          </>
        ) : (
          "Connect"
        )}
      </Button>
    </form>
  );
}
