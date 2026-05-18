"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  EntityLink,
  EntityLinkSearchResult,
  TargetType,
} from "@/lib/entity-links/types";
import { TARGET_TYPE_LABELS } from "@/lib/entity-links/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  FileText,
  Package,
  Link as LinkIcon,
  Upload,
  FilePlus,
  Check,
  Paperclip,
  User,
  Building2,
  ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const TARGET_ICONS: Record<string, React.ElementType> = {
  document: FileText,
  asset: Package,
  contact: User,
  organization: Building2,
  task: ListTodo,
  knowledge_item: FileText,
  url: LinkIcon,
};

interface EntityLinkPickerProps {
  links: EntityLink[];
  onLinkEntity: (
    targetType: TargetType,
    targetId: string,
    label?: string
  ) => void;
  onLinkUrl: (url: string, label?: string) => void;
  onUploadFile?: () => void;
  onCreatePage?: () => void;
  searchTargets: (
    query: string,
    targetTypes?: TargetType[]
  ) => Promise<EntityLinkSearchResult[]>;
  portal?: boolean;
  triggerLabel?: string;
  triggerVariant?: "default" | "subtle";
}

export function EntityLinkPicker({
  links,
  onLinkEntity,
  onLinkUrl,
  onUploadFile,
  onCreatePage,
  searchTargets,
  portal = true,
  triggerLabel = "Add link",
  triggerVariant = "default",
}: EntityLinkPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntityLinkSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const linkedSet = new Set(
    links
      .filter((l) => l.target_id)
      .map((l) => `${l.target_type}:${l.target_id}`)
  );

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim()) {
        setResults([]);
        return;
      }
      setSearching(true);
      debounceRef.current = setTimeout(async () => {
        const r = await searchTargets(value);
        setResults(r);
        setSearching(false);
      }, 300);
    },
    [searchTargets]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleSelectEntity(result: EntityLinkSearchResult) {
    if (linkedSet.has(`${result.target_type}:${result.id}`)) return;
    onLinkEntity(result.target_type, result.id, result.name);
  }

  function handleUrlSubmit() {
    const trimmed = urlValue.trim();
    if (!trimmed) return;
    onLinkUrl(trimmed);
    setUrlValue("");
    setShowUrlInput(false);
  }

  const grouped = results.reduce<Record<string, EntityLinkSearchResult[]>>(
    (acc, r) => {
      const key = r.target_type;
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    },
    {}
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQuery("");
          setResults([]);
          setShowUrlInput(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={
            triggerVariant === "subtle"
              ? "h-7 gap-1.5 px-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground"
              : "h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          }
        >
          <Paperclip className="h-3 w-3" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" portal={portal}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search items to link..."
            value={query}
            onValueChange={handleSearch}
          />
          <CommandList>
            {query.trim() && !searching && results.length === 0 && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}
            {searching && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Searching...
              </div>
            )}

            {Object.entries(grouped).map(([type, items]) => {
              const Icon = TARGET_ICONS[type] ?? FileText;
              return (
                <CommandGroup
                  key={type}
                  heading={TARGET_TYPE_LABELS[type as TargetType] ?? type}
                >
                  {items.map((r) => {
                    const isLinked = linkedSet.has(`${r.target_type}:${r.id}`);
                    return (
                      <CommandItem
                        key={`${r.target_type}-${r.id}`}
                        value={`${r.target_type}-${r.id}`}
                        disabled={isLinked}
                        onSelect={() => handleSelectEntity(r)}
                        className="gap-2"
                      >
                        {r.icon ? (
                          <span className="text-sm">{r.icon}</span>
                        ) : (
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className="flex-1 truncate text-sm">
                          {r.name}
                        </span>
                        {typeof r.extra?.asset_type === "string" && (
                          <span className="text-[10px] text-muted-foreground/60">
                            {r.extra.asset_type}
                          </span>
                        )}
                        {isLinked && (
                          <Check className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}

            <CommandSeparator />

            <CommandGroup heading="Actions">
              {onUploadFile && (
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    onUploadFile();
                  }}
                  className="gap-2"
                >
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">Upload file...</span>
                </CommandItem>
              )}
              {onCreatePage && (
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    onCreatePage();
                  }}
                  className="gap-2"
                >
                  <FilePlus className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">Create page...</span>
                </CommandItem>
              )}
              <CommandItem
                onSelect={() => setShowUrlInput(true)}
                className="gap-2"
              >
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">Add URL...</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>

          {showUrlInput && (
            <div className="border-t border-border/50 px-3 py-2">
              <input
                autoFocus
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleUrlSubmit();
                  }
                  if (e.key === "Escape") {
                    setShowUrlInput(false);
                    setUrlValue("");
                  }
                }}
                placeholder="https://..."
                className="w-full h-7 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
