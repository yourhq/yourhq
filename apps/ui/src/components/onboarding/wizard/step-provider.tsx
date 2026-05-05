"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2, Eye, EyeOff, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROVIDER_CATALOG, type ProviderCatalogEntry } from "@/lib/connections/types";
import { ProviderIcon } from "@/components/connections/provider-icons";

const AUTH_SHAPE_LABELS: Record<string, string> = {
  api_key: "API key",
  oauth_paste: "Sign in",
  device_code: "Sign in",
  cli_reuse: "Reuses CLI login",
  local_url: "Local — no key needed",
};

export interface StepProviderProps {
  onSubmit: (provider: string, apiKey: string) => void;
  pending: boolean;
  validating: boolean;
  validated: boolean;
  validationError?: string | null;
}

export function StepProvider({
  onSubmit,
  pending,
  validating,
  validated,
  validationError,
}: StepProviderProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const recommended = PROVIDER_CATALOG.filter((p) => p.category === "recommended");
  const openModels = PROVIDER_CATALOG.filter((p) => p.category === "open_models");
  const others = PROVIDER_CATALOG.filter((p) => p.category === "all");

  const selectedEntry = PROVIDER_CATALOG.find((p) => p.id === selected);
  const needsKey = selectedEntry && selectedEntry.authShape === "api_key";
  const isLocal = selectedEntry?.authShape === "local_url";
  const isOAuth = selectedEntry?.authShape === "oauth_paste" || selectedEntry?.authShape === "device_code";

  const canSubmit =
    selected &&
    (isLocal || isOAuth || apiKey.trim().length > 5) &&
    !validating &&
    !pending;

  const handleSelectProvider = (id: string) => {
    setSelected(id);
    setApiKey("");
    setShowKey(false);
  };

  const handleSubmit = () => {
    if (!selected) return;
    onSubmit(selected, apiKey.trim());
  };

  const renderProvider = (p: ProviderCatalogEntry) => {
    const isSelected = selected === p.id;
    return (
      <div key={p.id}>
        <button
          type="button"
          role="radio"
          aria-checked={isSelected}
          onClick={() => handleSelectProvider(p.id)}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-150 cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isSelected
              ? "border-foreground/60 bg-foreground/[0.04] ring-1 ring-foreground/10"
              : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
          )}
        >
          <ProviderIcon
            providerId={p.id}
            className="h-5 w-5 shrink-0 text-foreground/70"
          />
          <div className="flex-1 min-w-0">
            <span className="text-[14px] font-medium">{p.displayName}</span>
            {p.blurb && (
              <span className="ml-2 text-[12px] text-muted-foreground">{p.blurb}</span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground/60 shrink-0">
            {AUTH_SHAPE_LABELS[p.authShape] ?? p.authShape}
          </span>
          {isSelected && (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background shrink-0">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </div>
          )}
        </button>

        {isSelected && needsKey && (
          <div className="px-4 pb-3 pt-2.5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key"
                aria-label={`${p.displayName} API key`}
                autoFocus
                className="flex h-9 w-full rounded-lg border border-border/60 bg-background px-3 pr-9 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) handleSubmit();
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/50 hover:text-foreground transition-colors"
                aria-label={showKey ? "Hide API key" : "Show API key"}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {p.helpUrl && (
              <a
                href={p.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors underline underline-offset-2"
              >
                Get an API key →
              </a>
            )}
            {validationError && (
              <p className="text-[12px] text-destructive animate-in fade-in duration-150">
                {validationError}
              </p>
            )}
            {validated && (
              <p className="flex items-center gap-1.5 text-[12px] text-green-600 animate-in fade-in duration-200">
                <Check className="h-3 w-3" />
                Connected
              </p>
            )}
          </div>
        )}

        {isSelected && isLocal && (
          <div className="px-4 pb-3 pt-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
            <p className="text-[12px] text-muted-foreground">
              We&apos;ll auto-detect {p.displayName} running on your gateway. No API key needed.
            </p>
            {validationError && (
              <p className="mt-1.5 text-[12px] text-destructive animate-in fade-in duration-150">
                {validationError}
              </p>
            )}
          </div>
        )}

        {isSelected && isOAuth && (
          <div className="px-4 pb-3 pt-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
            <p className="text-[12px] text-muted-foreground">
              You&apos;ll sign in through {p.displayName} after setup is complete.
              This will be configured via your gateway.
            </p>
            {validationError && (
              <p className="mt-1.5 text-[12px] text-destructive animate-in fade-in duration-150">
                {validationError}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          AI Provider
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Connect an AI provider
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          Your key is stored on your gateway — we never see it. You can
          connect more providers later in Settings.
        </p>
      </div>

      <div role="radiogroup" aria-label="Choose AI provider" className="space-y-4">
        <div className="space-y-2">
          {recommended.map(renderProvider)}
        </div>

        {showAll && (
          <>
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/50 px-1 pt-2">
                Local / Open-source
              </div>
              <div className="space-y-2">
                {openModels.map(renderProvider)}
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/50 px-1 pt-2">
                All providers
              </div>
              <div className="space-y-2">
                {others.map(renderProvider)}
              </div>
            </div>
          </>
        )}

        {!showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors px-1"
          >
            <ChevronDown className="h-3 w-3" />
            Show all {openModels.length + others.length} providers
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
            !canSubmit
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {validating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Validating…
            </>
          ) : pending ? (
            "Saving…"
          ) : isLocal ? (
            <>
              Detect &amp; continue
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </>
          ) : isOAuth ? (
            <>
              Continue
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
