"use client";

import { useAgentsList } from "@/hooks/use-agents-list";
import {
  Command,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { Bot, User } from "lucide-react";

interface Measurable {
  getBoundingClientRect(): DOMRect;
}

interface MentionAutocompleteProps {
  open: boolean;
  filter: string;
  onSelect: (slug: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<Measurable | null>;
  portal?: boolean;
}

export function MentionAutocomplete({
  open,
  filter,
  onSelect,
  onClose,
  anchorRef,
  portal = true,
}: MentionAutocompleteProps) {
  const { agents } = useAgentsList();

  const normalizedFilter = filter.toLowerCase();
  const filtered = [
    { slug: "me", name: "You", isMe: true },
    ...agents.map((a) => ({ slug: a.slug, name: a.name, isMe: false })),
  ].filter(
    (item) =>
      item.slug.toLowerCase().includes(normalizedFilter) ||
      item.name.toLowerCase().includes(normalizedFilter)
  );

  return (
    <Popover open={open} onOpenChange={(o) => !o && onClose()}>
      <PopoverAnchor virtualRef={anchorRef as React.RefObject<Measurable>} />
      <PopoverContent
        className="w-56 p-0"
        align="start"
        side="bottom"
        sideOffset={4}
        portal={portal}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            {filtered.length === 0 && (
              <CommandEmpty className="py-3 text-xs">No matches</CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map((item) => (
                <CommandItem
                  key={item.slug}
                  value={item.slug}
                  onSelect={() => onSelect(item.slug)}
                  className="gap-2 text-xs"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
                    {item.isMe ? (
                      <User className="h-3 w-3" />
                    ) : (
                      <Bot className="h-3 w-3" />
                    )}
                  </div>
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    @{item.slug}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
