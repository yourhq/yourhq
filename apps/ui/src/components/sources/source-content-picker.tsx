"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SourceBrowseItem, SourceProvider } from "@/lib/sources/types";
import { PROVIDER_LABELS } from "@/lib/sources/types";
import { useSourceBrowse } from "@/hooks/use-source-browse";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  ChevronRight,
  Loader2,
  FileText,
  Database,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceContentPickerProps {
  open: boolean;
  connectionId: string;
  provider: SourceProvider;
  existingSyncedIds: Set<string>;
  onSync: (
    items: Array<{ external_id: string; title: string; source_url: string }>,
  ) => Promise<boolean>;
  onClose: () => void;
}

interface TreeNode extends SourceBrowseItem {
  children?: TreeNode[];
  expanded?: boolean;
  loadingChildren?: boolean;
}

export function SourceContentPicker({
  open,
  connectionId,
  provider,
  existingSyncedIds,
  onSync,
  onClose,
}: SourceContentPickerProps) {
  const { browse, clearCache } = useSourceBrowse();
  const [rootItems, setRootItems] = useState<TreeNode[]>([]);
  const [searchResults, setSearchResults] = useState<SourceBrowseItem[] | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<
    Map<string, { title: string; source_url: string }>
  >(new Map());
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!open) return;
    clearCache();
    setRootItems([]);
    setSearchResults(null);
    setQuery("");
    setSelected(new Map());
    setLoading(true);

    browse(connectionId).then((items) => {
      setRootItems(items.map((i) => ({ ...i })));
      setLoading(false);
    });
  }, [open, connectionId, browse, clearCache]);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!value.trim()) {
        setSearchResults(null);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const results = await browse(connectionId, null, value.trim());
          setSearchResults(results);
        } finally {
          setSearching(false);
        }
      }, 300);
    },
    [browse, connectionId],
  );

  const expandNode = useCallback(
    async (node: TreeNode, path: number[]) => {
      if (node.children) {
        setRootItems((prev) => {
          const next = structuredClone(prev);
          const target = getNodeByPath(next, path);
          if (target) target.expanded = !target.expanded;
          return next;
        });
        return;
      }

      setRootItems((prev) => {
        const next = structuredClone(prev);
        const target = getNodeByPath(next, path);
        if (target) target.loadingChildren = true;
        return next;
      });

      const children = await browse(connectionId, node.external_id);

      setRootItems((prev) => {
        const next = structuredClone(prev);
        const target = getNodeByPath(next, path);
        if (target) {
          target.children = children.map((c) => ({ ...c }));
          target.expanded = true;
          target.loadingChildren = false;
        }
        return next;
      });
    },
    [browse, connectionId],
  );

  const toggleSelect = useCallback(
    (item: SourceBrowseItem) => {
      if (existingSyncedIds.has(item.external_id)) return;
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(item.external_id)) {
          next.delete(item.external_id);
        } else {
          next.set(item.external_id, {
            title: item.title,
            source_url: item.source_url,
          });
        }
        return next;
      });
    },
    [existingSyncedIds],
  );

  const handleSubmit = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const items = Array.from(selected.entries()).map(
      ([external_id, { title, source_url }]) => ({
        external_id,
        title,
        source_url,
      }),
    );
    const ok = await onSync(items);
    setSaving(false);
    if (ok) onClose();
  };

  const isSearchMode = searchResults !== null;

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-2xl flex flex-col max-h-[80vh]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            Select content from {PROVIDER_LABELS[provider]}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Choose pages and databases to sync into Knowledge.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={`Search ${PROVIDER_LABELS[provider]}...`}
            className="pl-9"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[50vh] rounded-md border border-border/60">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : isSearchMode ? (
            searchResults.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground">
                No results found.
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {searchResults.map((item) => (
                  <BrowseRow
                    key={item.external_id}
                    item={item}
                    depth={0}
                    selected={selected.has(item.external_id)}
                    synced={existingSyncedIds.has(item.external_id)}
                    onToggle={() => toggleSelect(item)}
                    showPath
                  />
                ))}
              </div>
            )
          ) : rootItems.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground">
              No content found. Make sure you&apos;ve shared pages with your
              integration.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {rootItems.map((node, i) => (
                <TreeRow
                  key={node.external_id}
                  node={node}
                  path={[i]}
                  depth={0}
                  selected={selected}
                  existingSyncedIds={existingSyncedIds}
                  onToggle={toggleSelect}
                  onExpand={expandNode}
                />
              ))}
            </div>
          )}
        </div>

        <ResponsiveDialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <span className="text-[13px] text-muted-foreground">
            {selected.size > 0
              ? `${selected.size} item${selected.size > 1 ? "s" : ""} selected`
              : "Select items to sync"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={selected.size === 0 || saving}
            >
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Sync {selected.size > 0 ? `${selected.size} ` : ""}item
              {selected.size !== 1 ? "s" : ""}
            </Button>
          </div>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function TreeRow({
  node,
  path,
  depth,
  selected,
  existingSyncedIds,
  onToggle,
  onExpand,
}: {
  node: TreeNode;
  path: number[];
  depth: number;
  selected: Map<string, { title: string; source_url: string }>;
  existingSyncedIds: Set<string>;
  onToggle: (item: SourceBrowseItem) => void;
  onExpand: (node: TreeNode, path: number[]) => void;
}) {
  const isSynced = existingSyncedIds.has(node.external_id);
  const isSelected = selected.has(node.external_id);

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30">
        <div style={{ width: depth * 20 }} className="shrink-0" />

        {node.has_children ? (
          <button
            type="button"
            onClick={() => onExpand(node, path)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent"
          >
            {node.loadingChildren ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  node.expanded && "rotate-90",
                )}
              />
            )}
          </button>
        ) : (
          <div className="w-5 shrink-0" />
        )}

        {isSynced ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success" />
        ) : (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggle(node)}
            className="shrink-0"
          />
        )}

        <ItemIcon type={node.item_type} />

        <button
          type="button"
          onClick={() => (isSynced ? undefined : onToggle(node))}
          className="flex-1 min-w-0 text-left"
        >
          <span
            className={cn(
              "text-[13px] truncate block",
              isSynced
                ? "text-muted-foreground"
                : "text-foreground",
            )}
          >
            {node.title}
          </span>
        </button>

        {isSynced && (
          <span className="text-[11px] text-muted-foreground shrink-0">
            synced
          </span>
        )}
      </div>

      {node.expanded &&
        node.children?.map((child, i) => (
          <TreeRow
            key={child.external_id}
            node={child}
            path={[...path, i]}
            depth={depth + 1}
            selected={selected}
            existingSyncedIds={existingSyncedIds}
            onToggle={onToggle}
            onExpand={onExpand}
          />
        ))}
    </>
  );
}

function BrowseRow({
  item,
  depth,
  selected,
  synced,
  onToggle,
  showPath,
}: {
  item: SourceBrowseItem;
  depth: number;
  selected: boolean;
  synced: boolean;
  onToggle: () => void;
  showPath?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30">
      <div style={{ width: depth * 20 }} className="shrink-0" />
      <div className="w-5 shrink-0" />

      {synced ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success" />
      ) : (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="shrink-0"
        />
      )}

      <ItemIcon type={item.item_type} />

      <button
        type="button"
        onClick={() => (synced ? undefined : onToggle())}
        className="flex-1 min-w-0 text-left"
      >
        <span
          className={cn(
            "text-[13px] truncate block",
            synced ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {item.title}
        </span>
        {showPath && item.parent_path && (
          <span className="text-[11px] text-muted-foreground truncate block">
            {item.parent_path}
          </span>
        )}
      </button>

      {synced && (
        <span className="text-[11px] text-muted-foreground shrink-0">
          synced
        </span>
      )}
    </div>
  );
}

function ItemIcon({ type }: { type: string }) {
  if (type === "database") {
    return <Database className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function getNodeByPath(nodes: TreeNode[], path: number[]): TreeNode | null {
  let current: TreeNode | null = nodes[path[0]] ?? null;
  for (let i = 1; i < path.length; i++) {
    if (!current?.children) return null;
    current = current.children[path[i]] ?? null;
  }
  return current;
}
