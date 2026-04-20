"use client";

import { BOOT_TAG_ALL } from "@/lib/documents/boot-tags";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bot, X, Zap } from "lucide-react";
import { useState } from "react";

interface BootTagManagerProps {
  bootTags: string[];
  agents: { slug: string; name: string }[];
  onChange: (bootTags: string[]) => void;
}

export function BootTagManager({ bootTags, agents, onChange }: BootTagManagerProps) {
  const [open, setOpen] = useState(false);
  const hasAll = bootTags.includes(BOOT_TAG_ALL);
  const agentSlugs = bootTags
    .filter((t) => t !== BOOT_TAG_ALL)
    .map((t) => t.replace("boot:", ""));

  function toggleAll() {
    if (hasAll) {
      onChange(bootTags.filter((t) => t !== BOOT_TAG_ALL));
    } else {
      // Turn on "all" and remove individual agent tags
      onChange([BOOT_TAG_ALL]);
    }
  }

  function toggleAgent(slug: string) {
    const tag = `boot:${slug}`;
    if (bootTags.includes(tag)) {
      onChange(bootTags.filter((t) => t !== tag));
    } else {
      // If adding an individual agent, remove boot:all
      onChange([...bootTags.filter((t) => t !== BOOT_TAG_ALL), tag]);
    }
  }

  function removeTag(tag: string) {
    onChange(bootTags.filter((t) => t !== tag));
  }

  // Nothing selected — show an add button
  if (bootTags.length === 0) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
          >
            <Zap className="h-3 w-3" />
            <span>Add to agent context...</span>
          </button>
        </PopoverTrigger>
        <BootPopoverContent
          agents={agents}
          hasAll={hasAll}
          agentSlugs={agentSlugs}
          onToggleAll={toggleAll}
          onToggleAgent={toggleAgent}
        />
      </Popover>
    );
  }

  // Has selections — show pills
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasAll && (
        <BootPill
          label="All agents"
          icon={<Zap className="h-3 w-3" />}
          onRemove={() => removeTag(BOOT_TAG_ALL)}
        />
      )}
      {!hasAll &&
        agentSlugs.map((slug) => {
          const agent = agents.find((a) => a.slug === slug);
          return (
            <BootPill
              key={slug}
              label={agent?.name || slug}
              icon={<Bot className="h-3 w-3" />}
              onRemove={() => removeTag(`boot:${slug}`)}
            />
          );
        })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center justify-center rounded px-1 py-0.5 text-xs text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
          >
            +
          </button>
        </PopoverTrigger>
        <BootPopoverContent
          agents={agents}
          hasAll={hasAll}
          agentSlugs={agentSlugs}
          onToggleAll={toggleAll}
          onToggleAgent={toggleAgent}
        />
      </Popover>
    </div>
  );
}

function BootPill({
  label,
  icon,
  onRemove,
}: {
  label: string;
  icon: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400 ring-1 ring-inset ring-purple-500/20">
      {icon}
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded-sm p-0.5 transition-colors hover:bg-purple-500/20 hover:text-purple-300"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

function BootPopoverContent({
  agents,
  hasAll,
  agentSlugs,
  onToggleAll,
  onToggleAgent,
}: {
  agents: { slug: string; name: string }[];
  hasAll: boolean;
  agentSlugs: string[];
  onToggleAll: () => void;
  onToggleAgent: (slug: string) => void;
}) {
  return (
    <PopoverContent align="start" className="w-56 p-1.5">
      <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Load at agent startup
      </div>

      <button
        type="button"
        onClick={onToggleAll}
        className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
      >
        <Checkbox checked={hasAll} tabIndex={-1} className="pointer-events-none" />
        <Zap className="h-3.5 w-3.5 text-muted-foreground" />
        <span>All agents</span>
      </button>

      {agents.length > 0 && (
        <div className="my-1 h-px bg-border/50" />
      )}

      {agents.map((agent) => {
        const selected = hasAll || agentSlugs.includes(agent.slug);
        return (
          <button
            key={agent.slug}
            type="button"
            onClick={() => onToggleAgent(agent.slug)}
            disabled={hasAll}
            className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
          >
            <Checkbox
              checked={selected}
              tabIndex={-1}
              className="pointer-events-none"
            />
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{agent.name}</span>
          </button>
        );
      })}
    </PopoverContent>
  );
}
