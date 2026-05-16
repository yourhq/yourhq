"use client";

import { Brain } from "lucide-react";
import type { Agent } from "@/lib/agents/types";
import type { ThinkingLevel } from "@/lib/models/types";
import { THINKING_LEVELS, THINKING_LEVEL_LABELS } from "@/lib/models/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

interface Props {
  modelOverride: string | null;
  thinkingOverride: string | null;
  onModelChange: (model: string | null) => void;
  onThinkingChange: (thinking: string | null) => void;
  agentId: string;
  agents: Agent[];
}

export function TaskModelOverride({
  modelOverride: _modelOverride,
  thinkingOverride,
  onModelChange: _onModelChange,
  onThinkingChange,
  agentId: _agentId,
  agents: _agents,
}: Props) {

  const thinkingLabel = thinkingOverride
    ? THINKING_LEVEL_LABELS[thinkingOverride as ThinkingLevel] ?? thinkingOverride
    : "Default";

  return (
    <>
      <Select
        value={thinkingOverride ?? "__default__"}
        onValueChange={(v) => onThinkingChange(v === "__default__" ? null : v)}
      >
        <SelectTrigger className="h-7 w-auto gap-1.5 border-transparent bg-transparent shadow-none dark:bg-transparent px-2 text-xs font-normal hover:bg-accent rounded-md justify-start">
          <Brain className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">{thinkingLabel}</span>
        </SelectTrigger>
        <SelectContent portal={false}>
          <SelectItem value="__default__">Default</SelectItem>
          {THINKING_LEVELS.filter((l) => l.value !== "off").map((level) => (
            <SelectItem key={level.value} value={level.value}>
              {level.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
