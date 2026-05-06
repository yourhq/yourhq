"use client";

import { useState } from "react";
import type { SourceConnection, SourceProvider } from "@/lib/sources/types";
import {
  PROVIDER_LABELS,
  PROVIDER_SETUP_GUIDES,
} from "@/lib/sources/types";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProviderPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (connection: SourceConnection) => void;
  createConnection: (input: {
    provider: SourceProvider;
    account_label: string;
    credentials: Record<string, unknown>;
    sync_interval_hours?: number;
  }) => Promise<SourceConnection | null>;
  isHosted?: boolean;
  notionOAuthConfigured?: boolean;
}

type Step = "pick" | "setup";

interface ValidationResult {
  valid: boolean;
  error?: string;
  account_name?: string;
}

export function ProviderPickerDialog({
  open,
  onClose,
  onCreated,
  createConnection,
  isHosted = false,
  notionOAuthConfigured = false,
}: ProviderPickerDialogProps) {
  const [step, setStep] = useState<Step>("pick");
  const [provider, setProvider] = useState<SourceProvider | null>(null);
  const [label, setLabel] = useState("");
  const [credential, setCredential] = useState("");
  const [syncInterval, setSyncInterval] = useState("6");
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [saving, setSaving] = useState(false);

  const useOAuth = isHosted && notionOAuthConfigured;

  const reset = () => {
    setStep("pick");
    setProvider(null);
    setLabel("");
    setCredential("");
    setSyncInterval("6");
    setValidating(false);
    setValidation(null);
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const selectProvider = (p: SourceProvider) => {
    if (p === "notion" && useOAuth) {
      window.location.href = "/api/sources/oauth/notion/start";
      return;
    }
    setProvider(p);
    setStep("setup");
    setValidation(null);
  };

  const handleValidate = async () => {
    if (!provider || !credential.trim()) return;
    setValidating(true);
    setValidation(null);

    try {
      const creds: Record<string, unknown> =
        provider === "google_drive"
          ? { service_account: JSON.parse(credential) }
          : { api_key: credential.trim() };

      const res = await fetch("/api/sources/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, credentials: creds }),
      });
      const result: ValidationResult = await res.json();
      setValidation(result);

      if (result.valid && result.account_name && !label.trim()) {
        setLabel(result.account_name);
      }
    } catch {
      setValidation({ valid: false, error: "Failed to validate credentials" });
    } finally {
      setValidating(false);
    }
  };

  const handleConnect = async () => {
    if (!provider || !credential.trim() || !label.trim()) return;
    setSaving(true);

    const creds: Record<string, unknown> =
      provider === "google_drive"
        ? { service_account: JSON.parse(credential) }
        : { api_key: credential.trim() };

    const conn = await createConnection({
      provider,
      account_label: label.trim(),
      credentials: creds,
      sync_interval_hours: parseInt(syncInterval) || 6,
    });

    setSaving(false);
    if (conn) {
      reset();
      onCreated(conn);
    }
  };

  const guide = provider ? PROVIDER_SETUP_GUIDES[provider] : null;
  const canTest = !!credential.trim();
  const canConnect = validation?.valid && label.trim();

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-lg">
        {step === "pick" ? (
          <>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>Connect a source</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                Choose a service to sync content from.
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <ProviderCard
                provider="notion"
                onClick={() => selectProvider("notion")}
                badge={useOAuth ? "OAuth" : undefined}
              />
              <ProviderCard
                provider="google_drive"
                onClick={() => selectProvider("google_drive")}
                disabled
                comingSoon
              />
            </div>
            {useOAuth && (
              <p className="text-[11px] text-muted-foreground text-center -mt-1">
                You&apos;ll be redirected to Notion to authorize access.
              </p>
            )}
          </>
        ) : guide ? (
          <>
            <ResponsiveDialogHeader>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("pick");
                    setProvider(null);
                    setValidation(null);
                    setCredential("");
                    setLabel("");
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <ResponsiveDialogTitle>{guide.title}</ResponsiveDialogTitle>
              </div>
              <ResponsiveDialogDescription>{guide.description}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>

            <div className="space-y-4">
              <div className="space-y-3">
                {guide.steps.map((s, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-medium text-muted-foreground mt-0.5">
                      {i + 1}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[13px] font-medium text-foreground">
                        {s.title}
                      </p>
                      <p className="text-[12px] text-muted-foreground leading-relaxed">
                        {s.description}
                      </p>
                      {s.link && (
                        <a
                          href={s.link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
                        >
                          {s.link.label}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label>{guide.credentialLabel}</Label>
                {guide.credentialType === "token" ? (
                  <Input
                    type="password"
                    value={credential}
                    onChange={(e) => {
                      setCredential(e.target.value);
                      setValidation(null);
                    }}
                    placeholder={guide.credentialPlaceholder}
                  />
                ) : (
                  <textarea
                    value={credential}
                    onChange={(e) => {
                      setCredential(e.target.value);
                      setValidation(null);
                    }}
                    placeholder="Paste JSON key contents here..."
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-none"
                  />
                )}
                {validation && (
                  <div
                    className={cn(
                      "flex items-center gap-1.5 text-[12px]",
                      validation.valid ? "text-green-400" : "text-red-400",
                    )}
                  >
                    {validation.valid ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    {validation.valid
                      ? `Connected as ${validation.account_name ?? "verified"}`
                      : validation.error}
                  </div>
                )}
              </div>

              {validation?.valid && (
                <>
                  <div className="space-y-1.5">
                    <Label>Label</Label>
                    <Input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder={`My ${PROVIDER_LABELS[provider!]} workspace`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sync interval</Label>
                    <Select value={syncInterval} onValueChange={setSyncInterval}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Every hour</SelectItem>
                        <SelectItem value="6">Every 6 hours</SelectItem>
                        <SelectItem value="12">Every 12 hours</SelectItem>
                        <SelectItem value="24">Daily</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            <ResponsiveDialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              {validation?.valid ? (
                <Button
                  onClick={handleConnect}
                  disabled={!canConnect || saving}
                >
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Connect
                </Button>
              ) : (
                <Button
                  onClick={handleValidate}
                  disabled={!canTest || validating}
                >
                  {validating && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  Test connection
                </Button>
              )}
            </ResponsiveDialogFooter>
          </>
        ) : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function ProviderCard({
  provider,
  onClick,
  disabled,
  comingSoon,
  badge,
}: {
  provider: SourceProvider;
  onClick: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative flex flex-col items-start gap-2 rounded-lg border border-border/60 p-4 text-left transition-colors",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-border hover:bg-accent/50",
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card text-[13px] font-semibold text-muted-foreground">
        {provider === "notion" ? "N" : "G"}
      </div>
      <div>
        <p className="text-[13px] font-medium text-foreground">
          {PROVIDER_LABELS[provider]}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {provider === "notion"
            ? "Pages and databases"
            : "Documents and files"}
        </p>
      </div>
      {comingSoon && (
        <span className="absolute right-3 top-3 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          Soon
        </span>
      )}
      {badge && !comingSoon && (
        <span className="absolute right-3 top-3 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
          {badge}
        </span>
      )}
      {!disabled && (
        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
      )}
    </button>
  );
}
