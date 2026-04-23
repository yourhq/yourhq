"use client";

import { useState } from "react";
import { Database, ExternalLink, Copy, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface StepSupabaseProps {
  defaults: {
    workspaceLabel: string;
    workspaceEmoji: string;
    authEmail: string;
  };
  onSubmit: (vals: {
    workspaceLabel: string;
    workspaceEmoji: string;
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    authEmail: string;
    authPassword: string;
  }) => void;
  pending: boolean;
  sqlFallback?: string | null;
}

export function StepSupabase({
  defaults,
  onSubmit,
  pending,
  sqlFallback,
}: StepSupabaseProps) {
  const [phase, setPhase] = useState<"create" | "paste">("create");
  const [workspaceLabel, setWorkspaceLabel] = useState(defaults.workspaceLabel);
  const [workspaceEmoji, setWorkspaceEmoji] = useState(defaults.workspaceEmoji);
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [authEmail, setAuthEmail] = useState(defaults.authEmail);
  const [authPassword, setAuthPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const copySql = async () => {
    if (!sqlFallback) return;
    try {
      await navigator.clipboard.writeText(sqlFallback);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      workspaceLabel: workspaceLabel.trim() || "My workspace",
      workspaceEmoji,
      url: url.trim(),
      anonKey: anonKey.trim(),
      serviceRoleKey: serviceRoleKey.trim(),
      authEmail: authEmail.trim(),
      authPassword,
    });
  };

  if (phase === "create") {
    return (
      <div className="space-y-6 pt-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#3ecf8e]/10 text-[#3ecf8e]">
              <Database className="h-3.5 w-3.5" />
            </div>
            <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Supabase
            </span>
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight">
            Create your database
          </h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            HQ lives on your own Supabase — free tier is fine for personal
            use. No data ever touches our servers.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-4">
          <Step number={1} title="Open Supabase">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              We&apos;ll open supabase.com in a new tab. Sign in or create
              a free account.
            </p>
            <a
              href="https://supabase.com/dashboard/projects"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-[12px] font-medium hover:bg-accent/60"
            >
              Open Supabase <ExternalLink className="h-3 w-3" />
            </a>
          </Step>

          <Step number={2} title="Create a new project">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Click <span className="font-semibold">New project</span>, name
              it anything (&quot;HQ&quot; works), pick a strong database
              password, and choose a region close to you. Takes about 2 minutes
              to provision.
            </p>
          </Step>

          <Step number={3} title="Copy your keys">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Once the project is ready, go to{" "}
              <span className="font-medium">Project Settings → API</span> and
              copy these three values (we&apos;ll paste them in a second):
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
              <li>• Project URL</li>
              <li>• Anon (public) key</li>
              <li>• Service role key</li>
            </ul>
          </Step>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-[11px] text-muted-foreground/70">
            We&apos;ll install the schema + create your account automatically.
          </div>
          <Button onClick={() => setPhase("paste")}>
            I&apos;ve got my keys →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pt-6">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#3ecf8e]/10 text-[#3ecf8e]">
            <Database className="h-3.5 w-3.5" />
          </div>
          <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            Supabase
          </span>
        </div>
        <h1 className="text-[22px] font-semibold tracking-tight">
          Connect your Supabase project
        </h1>
        <p className="text-[13px] text-muted-foreground">
          We&apos;ll install the schema, create your account, and connect.
        </p>
      </div>

      <div className="space-y-4 rounded-md border border-border/60 bg-card p-4">
        <div className="grid grid-cols-[64px_1fr] gap-2">
          <div className="space-y-1.5">
            <Label className="text-[12px]">Icon</Label>
            <Input
              value={workspaceEmoji}
              onChange={(e) => setWorkspaceEmoji(e.target.value)}
              maxLength={8}
              className="text-center text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Workspace name</Label>
            <Input
              value={workspaceLabel}
              onChange={(e) => setWorkspaceLabel(e.target.value)}
              maxLength={80}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[12px]">Supabase project URL</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://xxxxxxxx.supabase.co"
            type="url"
            className="font-mono text-[12px]"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[12px]">Anon (public) key</Label>
          <Input
            value={anonKey}
            onChange={(e) => setAnonKey(e.target.value)}
            placeholder="sb_publishable_… or eyJ…"
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-[12px]"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[12px]">Service role key</Label>
          <Input
            value={serviceRoleKey}
            onChange={(e) => setServiceRoleKey(e.target.value)}
            placeholder="sb_secret_… or eyJ…"
            type="password"
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-[12px]"
            required
          />
          <p className="text-[11px] text-muted-foreground/70">
            Stored on this machine only in /config/secrets.json (mode 0600).
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-md border border-border/60 bg-card p-4">
        <div className="text-[12px] font-medium text-muted-foreground">
          Create your account
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px]">Email</Label>
          <Input
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px]">Password</Label>
          <Input
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            type="password"
            placeholder="At least 6 characters"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
      </div>

      {sqlFallback && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-[12px]">
          <div className="font-medium text-amber-600 dark:text-amber-400">
            Couldn&apos;t install schema automatically
          </div>
          <p className="text-muted-foreground">
            Paste the SQL below into your Supabase SQL editor, then hit
            Connect again.
          </p>
          <button
            type="button"
            onClick={copySql}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] hover:bg-accent/60"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy SQL
              </>
            )}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setPhase("create")}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← Back to instructions
        </button>
        <Button type="submit" disabled={pending}>
          {pending ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </form>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
        {number}
      </div>
      <div className="flex-1 space-y-1 pb-2">
        <div className="text-[13px] font-medium">{title}</div>
        {children}
      </div>
    </div>
  );
}
