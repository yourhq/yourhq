"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Provider = "anthropic" | "openai" | "ollama";

interface ProviderOption {
  id: Provider;
  label: string;
  placeholder: string;
  autoDetect?: boolean;
}

const PROVIDERS: ProviderOption[] = [
  { id: "anthropic", label: "Anthropic (Claude)", placeholder: "sk-ant-..." },
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "ollama", label: "Local (Ollama)", placeholder: "", autoDetect: true },
];

export interface StepProviderProps {
  isHosted: boolean;
  onSubmit: (provider: Provider, apiKey: string) => void;
  onSkip?: () => void;
  pending: boolean;
  validating: boolean;
  validated: boolean;
  validationError?: string | null;
}

export function StepProvider({
  isHosted,
  onSubmit,
  onSkip,
  pending,
  validating,
  validated,
  validationError,
}: StepProviderProps) {
  const [selected, setSelected] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState("");

  if (isHosted) {
    return (
      <div className="space-y-10 pt-8">
        <div className="space-y-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
            AI Model
          </div>
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
            Your agents are powered by Claude
          </h1>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
            We&apos;ve connected Claude Sonnet as your default model. You can
            add your own API keys or switch providers in Settings later.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/40 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/[0.06] text-[18px]">
              🤖
            </span>
            <div>
              <div className="text-[14px] font-medium">Claude Sonnet</div>
              <div className="text-[12px] text-muted-foreground">
                Fast, capable, and cost-effective
              </div>
            </div>
            <Check className="ml-auto h-4 w-4 text-green-500" />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onSkip}
            disabled={pending}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
              pending
                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                : "bg-foreground text-background hover:bg-foreground/90",
            )}
          >
            Continue
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    );
  }

  const canSubmit =
    selected &&
    (selected === "ollama" || apiKey.trim().length > 10) &&
    !validating &&
    !pending;

  return (
    <div className="space-y-10 pt-8">
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

      <div className="space-y-2">
        {PROVIDERS.map((p) => {
          const isSelected = selected === p.id;
          return (
            <div key={p.id} className="space-y-0">
              <button
                type="button"
                onClick={() => {
                  setSelected(p.id);
                  setApiKey("");
                }}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-150",
                  isSelected
                    ? "border-foreground/80 bg-foreground/[0.04]"
                    : "border-border/60 bg-card/40 hover:border-border hover:bg-card/70",
                )}
              >
                <span className="text-[14px] font-medium">{p.label}</span>
                {isSelected && (
                  <div className="ml-auto h-2 w-2 rounded-full bg-foreground" />
                )}
              </button>

              {isSelected && !p.autoDetect && (
                <div className="px-4 pb-3 pt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={p.placeholder}
                    autoFocus
                    className="flex h-9 w-full rounded-md border border-border/60 bg-background px-3 text-[13px] font-mono outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canSubmit) {
                        onSubmit(p.id, apiKey.trim());
                      }
                    }}
                  />
                  {validationError && (
                    <p className="mt-1.5 text-[12px] text-destructive">
                      {validationError}
                    </p>
                  )}
                </div>
              )}

              {isSelected && p.autoDetect && (
                <div className="px-4 pb-3 pt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                  <p className="text-[12px] text-muted-foreground">
                    We&apos;ll detect Ollama on your gateway automatically.
                    Make sure it&apos;s running at{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                      localhost:11434
                    </code>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {validated && (
        <div className="flex items-center gap-2 text-[13px] text-green-600 animate-in fade-in duration-200">
          <Check className="h-3.5 w-3.5" />
          <span>Connected successfully</span>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => selected && onSubmit(selected, apiKey.trim())}
          disabled={!canSubmit}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
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
