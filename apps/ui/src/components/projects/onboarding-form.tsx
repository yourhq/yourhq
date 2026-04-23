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

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // Plain onSubmit (not form action={…}) so fields retain their values
    // when the server action returns a non-ok result. Next.js's form
    // action semantics reset uncontrolled inputs on completion.
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setResult(null);
    startTransition(async () => {
      const r = await connectProject(formData);
      // connectProject redirects on success; we only return on failure.
      setResult(r);
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-md border border-border/60 bg-card p-5 shadow-sm space-y-4"
    >
      <div className="grid grid-cols-[64px_1fr] gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="emoji" className="text-[12px]">
            Icon
          </Label>
          <Input
            id="emoji"
            name="emoji"
            defaultValue="🏠"
            maxLength={8}
            className="text-center text-base"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="label" className="text-[12px]">
            Workspace name
          </Label>
          <Input
            id="label"
            name="label"
            placeholder="My workspace"
            maxLength={80}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="url" className="text-[12px]">
          Supabase project URL
        </Label>
        <Input
          id="url"
          name="url"
          type="url"
          placeholder="https://xxxxxxxx.supabase.co"
          className="font-mono"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="anonKey" className="text-[12px]">
          Anon (public) key
        </Label>
        <Input
          id="anonKey"
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
        <Label htmlFor="serviceRoleKey" className="text-[12px]">
          Service role key
        </Label>
        <Input
          id="serviceRoleKey"
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
          <span className="font-mono text-foreground/80">
            /config/secrets.json
          </span>{" "}
          (mode 0600). Never sent to the browser.
        </p>
      </div>

      <div className="flex items-start gap-2 border-t border-border/50 pt-3 text-[11px] text-muted-foreground/70">
        <span className="shrink-0">Before connecting, run</span>
        <a
          href="https://github.com/yourhq/yourhq/blob/main/db/migrations/001_schema.sql"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 font-mono text-foreground hover:underline"
        >
          001_schema.sql
          <ExternalLink className="h-3 w-3" />
        </a>
        <span>in your Supabase SQL editor.</span>
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

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            Validating…
          </>
        ) : (
          "Connect"
        )}
      </Button>
    </form>
  );
}
