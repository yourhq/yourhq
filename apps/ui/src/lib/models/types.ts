export type ThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelEntry {
  id: string;
  displayName: string;
  provider: string;
  providerDisplayName: string;
  /** Shown when multiple routes exist for the same model (e.g. "Subscription" vs "API") */
  viaLabel?: string;
  /** If true, model is only available through its specific provider — not remappable */
  exclusive?: boolean;
}

export interface ModelCatalogGroup {
  provider: string;
  providerDisplayName: string;
  models: ModelEntry[];
}

export const THINKING_LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Max" },
];

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};
