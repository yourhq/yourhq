"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Brain, ChevronDown, ExternalLink, Loader2, Plug } from "lucide-react";
import { toast } from "sonner";
import { MicroTip } from "@/components/onboarding/micro-tip";
import { setAgentModelAction } from "@/app/dashboard/agents/actions";
import {
  readConnectionsForGateway,
  refreshConnectionsAction,
} from "@/app/dashboard/settings/connections/actions";
import type { Connection } from "@/lib/connections/types";
import {
  getCuratedModelsForProviders,
  getModelDisplayName,
  getModelProvider,
  getCanonicalProvider,
  AGGREGATOR_PROVIDERS,
  LOCAL_PROVIDERS,
} from "@/lib/models/catalog";
import type { ModelEntry, ThinkingLevel } from "@/lib/models/types";
import { THINKING_LEVELS, THINKING_LEVEL_LABELS } from "@/lib/models/types";
import { ProviderIcon } from "@/components/connections/provider-icons";
import { cn } from "@/lib/utils";

interface Props {
  agentId: string;
  gatewayId: string;
  currentModel: string | null;
  currentThinking: string | null;
  onModelChange?: (model: string | null) => void;
}

export function AgentModelSection({
  agentId,
  gatewayId,
  currentModel,
  currentThinking,
  onModelChange,
}: Props) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [saving, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setModelOpen(false);
        setThinkingOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const load = useCallback(() => {
    void readConnectionsForGateway(gatewayId).then((r) => {
      if (r.ok && r.data) {
        setConnections(r.data.connections);
        if (r.data.connections.length === 0 && !r.data.lastCheckedAt) {
          void refreshConnectionsAction(gatewayId).then((fresh) => {
            if (fresh.ok && fresh.data) setConnections(fresh.data.connections);
          });
        }
      }
    });
  }, [gatewayId]);

  useEffect(() => { load(); }, [load]);

  const healthy = (connections ?? []).filter((c) => c.status === "ok");
  const connectedProviders = [...new Set(healthy.map((c) => c.provider))];

  const modelGroups = getCuratedModelsForProviders(connectedProviders);
  const dynamicProviders = connectedProviders.filter(
    (p) => AGGREGATOR_PROVIDERS.has(p) || LOCAL_PROVIDERS.has(p),
  );

  const handleModelChange = useCallback(
    (modelId: string | null) => {
      setModelOpen(false);
      startTransition(async () => {
        const result = await setAgentModelAction(agentId, modelId, currentThinking);
        if (!result.ok) {
          toast.error(result.error ?? "Failed to update model");
          return;
        }
        toast.success(modelId ? `Model set to ${getModelDisplayName(modelId)}` : "Model cleared");
        onModelChange?.(modelId);
      });
    },
    [agentId, currentThinking, onModelChange],
  );

  const handleThinkingChange = useCallback(
    (level: string | null) => {
      setThinkingOpen(false);
      startTransition(async () => {
        const result = await setAgentModelAction(agentId, currentModel, level);
        if (!result.ok) {
          toast.error(result.error ?? "Failed to update thinking");
          return;
        }
        const label = level ? THINKING_LEVEL_LABELS[level as ThinkingLevel] ?? level : "Off";
        toast.success(`Thinking set to ${label}`);
      });
    },
    [agentId, currentModel],
  );

  const displayModel = currentModel ? getModelDisplayName(currentModel) : null;
  const displayThinking = currentThinking
    ? THINKING_LEVEL_LABELS[currentThinking as ThinkingLevel] ?? currentThinking
    : "Off";

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Model selector */}
      <MicroTip tipKey="agent-model" content="Choose which AI model this agent uses. Different models have different strengths." position="left">
      <div className="relative">
        <button
          type="button"
          onClick={() => { setModelOpen(!modelOpen); setThinkingOpen(false); }}
          disabled={saving}
          className={cn(
            "flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left text-[12px] transition-colors",
            "hover:bg-accent/40",
            modelOpen && "bg-accent/40",
          )}
        >
          {currentModel && (
            <ProviderIcon
              providerId={getCanonicalProvider(getModelProvider(currentModel))}
              className="h-3 w-3 shrink-0"
            />
          )}
          <span className="min-w-0 flex-1 truncate text-foreground">
            {saving ? "Saving..." : displayModel ?? "No model selected"}
          </span>
          {saving ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
        </button>

        {modelOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            {currentModel && (
              <button
                type="button"
                onClick={() => handleModelChange(null)}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Use gateway default
              </button>
            )}
            {modelGroups.map((group) => (
              <div key={group.provider}>
                <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group.providerDisplayName}
                </div>
                {group.models.map((m) => (
                  <ModelOption
                    key={m.id}
                    model={m}
                    selected={currentModel === m.id}
                    onSelect={() => handleModelChange(m.id)}
                  />
                ))}
              </div>
            ))}
            {dynamicProviders.length > 0 && (
              <div className="border-t px-2 py-1.5 text-[10px] text-muted-foreground/70">
                {dynamicProviders.map((p) => p).join(", ")} — type any model ID
              </div>
            )}
            {healthy.length === 0 && connections !== null && (
              <p className="px-2 py-2 text-[11px] text-muted-foreground">
                Connect a provider first
              </p>
            )}
          </div>
        )}
      </div>
      </MicroTip>

      {/* Thinking selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setThinkingOpen(!thinkingOpen); setModelOpen(false); }}
          disabled={saving}
          className={cn(
            "flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left text-[12px] transition-colors",
            "hover:bg-accent/40",
            thinkingOpen && "bg-accent/40",
          )}
        >
          <Brain className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-foreground">
            Thinking: {displayThinking}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>

        {thinkingOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-40 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            {THINKING_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => handleThinkingChange(level.value === "off" ? null : level.value)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[12px] transition-colors",
                  (currentThinking ?? "off") === level.value
                    ? "bg-primary/8 text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {level.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Manage connections link */}
      <Link
        href="/dashboard/settings/connections"
        className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground/70 hover:text-foreground hover:underline"
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <Plug className="h-3 w-3" />
          Manage connections
        </span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </Link>
    </div>
  );
}

function ModelOption({
  model,
  selected,
  onSelect,
}: {
  model: ModelEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[12px] transition-colors",
        selected
          ? "bg-primary/8 text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <ProviderIcon providerId={getCanonicalProvider(model.provider)} className="h-3 w-3 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{model.displayName}</span>
      {model.viaLabel && (
        <span className="shrink-0 text-[10px] text-muted-foreground/60">
          {model.viaLabel}
        </span>
      )}
    </button>
  );
}
