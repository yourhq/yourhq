"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { TaskAttachment, AttachmentEntityType } from "@/lib/tasks/types";
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
import { FileText, Package, Link, Upload, FilePlus, Check, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchResult {
  id: string;
  name: string;
  type: AttachmentEntityType;
  icon?: string;
  asset_type?: string;
}

interface AttachmentPickerProps {
  attachments: TaskAttachment[];
  onAttachEntity: (entityType: AttachmentEntityType, entityId: string, label?: string) => void;
  onAttachUrl: (url: string, label?: string) => void;
  onUploadFile: () => void;
  onCreateNote: () => void;
  searchEntities: (query: string) => Promise<SearchResult[]>;
  portal?: boolean;
}

export function AttachmentPicker({
  attachments,
  onAttachEntity,
  onAttachUrl,
  onUploadFile,
  onCreateNote,
  searchEntities,
  portal = true,
}: AttachmentPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const attachedSet = new Set(
    attachments
      .filter((a) => a.entity_id)
      .map((a) => `${a.entity_type}:${a.entity_id}`)
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
        const r = await searchEntities(value);
        setResults(r);
        setSearching(false);
      }, 300);
    },
    [searchEntities]
  );

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleSelectEntity(result: SearchResult) {
    if (attachedSet.has(`${result.type}:${result.id}`)) return;
    onAttachEntity(result.type, result.id, result.name);
  }

  function handleUrlSubmit() {
    const trimmed = urlValue.trim();
    if (!trimmed) return;
    onAttachUrl(trimmed);
    setUrlValue("");
    setShowUrlInput(false);
  }

  const docResults = results.filter((r) => r.type === "document");
  const assetResults = results.filter((r) => r.type === "asset");

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQuery(""); setResults([]); setShowUrlInput(false); } }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
          <Paperclip className="h-3 w-3" />
          Attach
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        portal={portal}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search documents & assets..."
            value={query}
            onValueChange={handleSearch}
          />
          <CommandList>
            {query.trim() && !searching && results.length === 0 && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}
            {searching && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>
            )}

            {docResults.length > 0 && (
              <CommandGroup heading="Documents">
                {docResults.map((r) => {
                  const isAttached = attachedSet.has(`document:${r.id}`);
                  return (
                    <CommandItem
                      key={r.id}
                      value={r.id}
                      disabled={isAttached}
                      onSelect={() => handleSelectEntity(r)}
                      className="gap-2"
                    >
                      {r.icon ? (
                        <span className="text-sm">{r.icon}</span>
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate text-sm">{r.name}</span>
                      {isAttached && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {assetResults.length > 0 && (
              <CommandGroup heading="Assets">
                {assetResults.map((r) => {
                  const isAttached = attachedSet.has(`asset:${r.id}`);
                  return (
                    <CommandItem
                      key={r.id}
                      value={r.id}
                      disabled={isAttached}
                      onSelect={() => handleSelectEntity(r)}
                      className="gap-2"
                    >
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate text-sm">{r.name}</span>
                      {r.asset_type && (
                        <span className="text-[10px] text-muted-foreground/60">{r.asset_type}</span>
                      )}
                      {isAttached && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            <CommandSeparator />

            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => { setOpen(false); onUploadFile(); }} className="gap-2">
                <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">Upload file...</span>
              </CommandItem>
              <CommandItem onSelect={() => { setOpen(false); onCreateNote(); }} className="gap-2">
                <FilePlus className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">Create text note...</span>
              </CommandItem>
              <CommandItem
                onSelect={() => setShowUrlInput(true)}
                className="gap-2"
              >
                <Link className="h-3.5 w-3.5 text-muted-foreground" />
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
                  if (e.key === "Enter") { e.preventDefault(); handleUrlSubmit(); }
                  if (e.key === "Escape") { setShowUrlInput(false); setUrlValue(""); }
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
