"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Provider = "anthropic" | "openai" | "ollama";

interface ProviderOption {
  id: Provider;
  label: string;
  description: string;
  placeholder: string;
  autoDetect?: boolean;
}

const PROVIDERS: ProviderOption[] = [
  { id: "anthropic", label: "Anthropic", description: "Claude models", placeholder: "sk-ant-..." },
  { id: "openai", label: "OpenAI", description: "GPT & o-series models", placeholder: "sk-..." },
  { id: "ollama", label: "Ollama", description: "Local models, auto-detected", placeholder: "", autoDetect: true },
];

export interface StepProviderProps {
  onSubmit: (provider: Provider, apiKey: string) => void;
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
  const [selected, setSelected] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const canSubmit =
    selected &&
    (selected === "ollama" || apiKey.trim().length > 10) &&
    !validating &&
    !pending;

  const handleSelectProvider = (id: Provider) => {
    setSelected(id);
    setApiKey("");
    setShowKey(false);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          AI Model
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Which AI should your agents use?
        </h1>
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
          Your API key is stored on your gateway — we never see it. You can
          add more providers in Settings later.
        </p>
      </div>

      <div role="radiogroup" aria-label="Choose AI provider" className="space-y-2">
        {PROVIDERS.map((p) => {
          const isSelected = selected === p.id;
          return (
            <div key={p.id}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => handleSelectProvider(p.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-150 cursor-pointer",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isSelected
                    ? "border-foreground/60 bg-foreground/[0.04] ring-1 ring-foreground/10"
                    : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                )}
              >
                <div className="flex-1">
                  <span className="text-[14px] font-medium">{p.label}</span>
                  <span className="ml-2 text-[12px] text-muted-foreground">{p.description}</span>
                </div>
                {isSelected && (
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </div>
                )}
              </button>

              {isSelected && !p.autoDetect && (
                <div className="px-4 pb-3 pt-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={p.placeholder}
                      aria-label={`${p.label} API key`}
                      autoFocus
                      className="flex h-9 w-full rounded-lg border border-border/60 bg-background px-3 pr-9 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canSubmit) {
                          onSubmit(p.id, apiKey.trim());
                        }
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
                  {validationError && (
                    <p className="mt-1.5 text-[12px] text-destructive animate-in fade-in duration-150">
                      {validationError}
                    </p>
                  )}
                  {validated && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-green-600 animate-in fade-in duration-200">
                      <Check className="h-3 w-3" />
                      Connected
                    </p>
                  )}
                </div>
              )}

              {isSelected && p.autoDetect && (
                <div className="px-4 pb-3 pt-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                  <p className="text-[12px] text-muted-foreground">
                    We&apos;ll auto-detect Ollama on your gateway.
                    Make sure it&apos;s running at{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                      localhost:11434
                    </code>
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
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => selected && onSubmit(selected, apiKey.trim())}
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
          ) : selected === "ollama" ? (
            <>
              Detect &amp; continue
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
