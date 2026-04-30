"use client";

// Root-level error boundary. Catches anything that escapes the segment-
// specific error boundaries (e.g. /dashboard/error.tsx) — which happens
// when the error is thrown in the root layout, middleware, or before
// any segment gets to render.
//
// Common causes we should make recoverable:
//   - Stale active project: cookie points at a project id that was
//     deleted, or a project whose Supabase creds were revoked.
//   - Registry file corrupted: projects.json or secrets.json malformed.
//   - Supabase unreachable: DNS issue, project paused.

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root-error]", error);
  }, [error]);

  // Detect the stale-project case so we can offer project-specific recovery.
  const looksLikeProjectIssue =
    /supabase|project|registry|config|getUser|fetch failed|ENOTFOUND/i.test(
      error.message ?? "",
    );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
          <AlertTriangle className="h-5 w-5" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-[20px] font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {looksLikeProjectIssue
              ? "We couldn't reach the Supabase project you're currently on. " +
                "It may have been deleted, paused, or its keys rotated."
              : error.message || "An unexpected error occurred."}
          </p>
          {error.digest && (
            <p className="pt-1 font-mono text-[10px] text-muted-foreground/70">
              {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          {looksLikeProjectIssue && (
            <>
              <Button variant="outline" asChild>
                <a href="/dashboard/settings/projects">Switch project</a>
              </Button>
              <Button variant="outline" asChild>
                <a href="/onboarding">Onboarding</a>
              </Button>
            </>
          )}
        </div>

        {!looksLikeProjectIssue && error.message && (
          <details className="rounded-md border border-border/60 bg-card/60 p-3 text-left">
            <summary className="cursor-pointer text-[11px] text-muted-foreground">
              Technical details
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-muted-foreground">
              {error.message}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
