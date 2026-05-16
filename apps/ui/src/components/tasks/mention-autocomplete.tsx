"use client";

import { useMemo } from "react";
import { useAgentsList } from "@/hooks/use-agents-list";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Measurable {
  getBoundingClientRect(): DOMRect;
}

export interface MentionItem {
  slug: string;
  name: string;
  isMe: boolean;
  emoji?: string;
}

interface MentionAutocompleteProps {
  open: boolean;
  filter: string;
  onSelect: (slug: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<Measurable | null>;
  portal?: boolean;
  activeIndex?: number;
}

export function useMentionItems(filter: string): MentionItem[] {
  const { agents } = useAgentsList();
  const normalizedFilter = filter.toLowerCase();
  return useMemo(() => {
    const all: MentionItem[] = [
      { slug: "me", name: "You", isMe: true },
      ...agents.map((a) => ({ slug: a.slug, name: a.name, isMe: false, emoji: a.meta?.emoji as string | undefined })),
    ];
    return all.filter(
      (item) =>
        item.slug.toLowerCase().includes(normalizedFilter) ||
        item.name.toLowerCase().includes(normalizedFilter)
    );
  }, [agents, normalizedFilter]);
}

export function MentionAutocomplete({
  open,
  filter,
  onSelect,
  onClose,
  anchorRef,
  portal = true,
  activeIndex = 0,
}: MentionAutocompleteProps) {
  const filtered = useMentionItems(filter);

  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor virtualRef={anchorRef as React.RefObject<Measurable>} />
      <PopoverContent
        className="w-56 p-1"
        align="start"
        side="bottom"
        sideOffset={4}
        portal={portal}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {filtered.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">No matches</p>
        ) : (
          <div role="listbox">
            {filtered.map((item, idx) => (
              <button
                key={item.slug}
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item.slug);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                  idx === activeIndex
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/50"
                )}
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted shrink-0 text-sm">
                  {item.isMe ? (
                    <User className="h-3 w-3" />
                  ) : item.emoji ? (
                    <span>{item.emoji}</span>
                  ) : (
                    <Bot className="h-3 w-3" />
                  )}
                </div>
                <span className="flex-1 truncate text-left">{item.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  @{item.slug}
                </span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
