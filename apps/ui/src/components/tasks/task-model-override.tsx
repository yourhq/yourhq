"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, ChevronDown, Loader2 } from "lucide-react";
import type { Agent } from "@/lib/agents/types";
import type { ThinkingLevel } from "@/lib/models/types";
import { THINKING_LEVELS, THINKING_LEVEL_LABELS } from "@/lib/models/types";
import {
  getCuratedModelsForProviders,
  getModelDisplayName,
  getModelProvider,
  getCanonicalProvider,
  makeCustomModelEntry,
  AGGREGATOR_PROVIDERS,
  LOCAL_PROVIDERS,
  ALL_KNOWN_PROVIDERS,
} from "@/lib/models/catalog";
import type { ModelEntry } from "@/lib/models/types";
import type { Connection } from "@/lib/connections/types";
import {
  readConnectionsForGateway,
  refreshConnectionsAction,
} from "@/app/dashboard/settings/connections/actions";
import { ProviderIcon } from "@/components/connections/provider-icons";
import { cn } from "@/lib/utils";

export const connectionCache = new Map<string, { connections: Connection[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

interface Props {
  modelOverride: string | null;
  thinkingOverride: string | null;
  onModelChange: (model: string | null) => void;
  onThinkingChange: (thinking: string | null) => void;
  agentId: string;
  agents: Agent[];
}

export function TaskModelOverride({
  modelOverride,
  thinkingOverride,
  onModelChange,
  onThinkingChange,
  agentId,
  agents,
}: Props) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const agent = agents.find((a) => a.id === agentId);
  const gatewayId = agent?.gateway_id ?? "default";

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

  useEffect(() => {
    const cached = connectionCache.get(gatewayId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnections(cached.connections);
      return;
    }
    void readConnectionsForGateway(gatewayId).then((r) => {
      if (r.ok && r.data) {
        setConnections(r.data.connections);
        connectionCache.set(gatewayId, { connections: r.data.connections, ts: Date.now() });
        if (r.data.connections.length === 0) {
          setRefreshing(true);
          void refreshConnectionsAction(gatewayId)
            .then((fresh) => {
              if (fresh.ok && fresh.data) {
                setConnections(fresh.data.connections);
                connectionCache.set(gatewayId, { connections: fresh.data.connections, ts: Date.now() });
              }
            })
            .finally(() => setRefreshing(false));
        }
      }
    });
  }, [gatewayId]);

  const usable = (connections ?? []).filter(
    (c) => c.status !== "expired" && c.status !== "invalid" && c.status !== "missing_credential",
  );
  const connectedProviders = [...new Set(usable.map((c) => c.provider))];

  if (modelOverride) {
    const activeProvider = getModelProvider(modelOverride);
    const canonical = getCanonicalProvider(activeProvider);
    if (!connectedProviders.includes(activeProvider)) connectedProviders.push(activeProvider);
    if (canonical !== activeProvider && !connectedProviders.includes(canonical)) connectedProviders.push(canonical);
  }

  const hasConnectionData = usable.length > 0 || modelOverride !== null;
  const modelGroups = hasConnectionData
    ? getCuratedModelsForProviders(connectedProviders)
    : getCuratedModelsForProviders(ALL_KNOWN_PROVIDERS);
  const dynamicProviders = hasConnectionData
    ? connectedProviders.filter(
        (p) => AGGREGATOR_PROVIDERS.has(p) || LOCAL_PROVIDERS.has(p),
      )
    : [...AGGREGATOR_PROVIDERS];

  const currentModelInGroups = modelGroups.some((g) =>
    g.models.some((m) => m.id === modelOverride),
  );

  const handleModelChange = useCallback(
    (modelId: string | null) => {
      setModelOpen(false);
      setCustomInput("");
      onModelChange(modelId);
    },
    [onModelChange],
  );

  const handleThinkingChange = useCallback(
    (level: string | null) => {
      setThinkingOpen(false);
      onThinkingChange(level);
    },
    [onThinkingChange],
  );

  const displayModel = modelOverride ? getModelDisplayName(modelOverride) : "Default";
  const thinkingLabel = thinkingOverride
    ? THINKING_LEVEL_LABELS[thinkingOverride as ThinkingLevel] ?? thinkingOverride
    : "Default";

  return (
    <div ref={containerRef} className="flex items-center gap-1">
      {/* Model selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setModelOpen(!modelOpen); setThinkingOpen(false); }}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors",
            "hover:bg-accent/40",
            modelOpen && "bg-accent/40",
          )}
        >
          {modelOverride ? (
            <ProviderIcon
              providerId={getCanonicalProvider(getModelProvider(modelOverride))}
              className="h-3 w-3 shrink-0"
            />
          ) : null}
          <span className="truncate max-w-[110px] text-muted-foreground">
            {refreshing ? "Checking…" : displayModel}
          </span>
          {refreshing ? (
            <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
          )}
        </button>

        {modelOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            <button
              type="button"
              onClick={() => handleModelChange(null)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[12px] transition-colors",
                !modelOverride
                  ? "bg-primary/8 text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              Default (agent&apos;s model)
            </button>
            {modelGroups.map((group) => (
              <div key={group.provider}>
                <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group.providerDisplayName}
                </div>
                {group.models.map((m) => (
                  <ModelOption
                    key={m.id}
                    model={m}
                    selected={modelOverride === m.id}
                    onSelect={() => handleModelChange(m.id)}
                  />
                ))}
              </div>
            ))}
            {modelOverride && !currentModelInGroups && (
              <div>
                <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Current
                </div>
                <ModelOption
                  model={makeCustomModelEntry(modelOverride)}
                  selected
                  onSelect={() => {}}
                />
              </div>
            )}
            {dynamicProviders.length > 0 && (
              <div className="border-t px-1.5 py-1.5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = customInput.trim();
                    if (!value) return;
                    const modelId = value.includes("/")
                      ? value
                      : `${dynamicProviders[0]}/${value}`;
                    handleModelChange(modelId);
                  }}
                >
                  <input
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder={`${dynamicProviders[0]}/model-name`}
                    className="w-full rounded border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    Enter to select custom model
                  </p>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      <span className="text-muted-foreground/30">|</span>

      {/* Thinking selector */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setThinkingOpen(!thinkingOpen); setModelOpen(false); }}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors",
            "hover:bg-accent/40",
            thinkingOpen && "bg-accent/40",
          )}
        >
          <Brain className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">{thinkingLabel}</span>
          <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
        </button>

        {thinkingOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-36 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            <button
              type="button"
              onClick={() => handleThinkingChange(null)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[12px] transition-colors",
                !thinkingOverride
                  ? "bg-primary/8 text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              Default
            </button>
            {THINKING_LEVELS.filter((l) => l.value !== "off").map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => handleThinkingChange(level.value)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[12px] transition-colors",
                  thinkingOverride === level.value
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
