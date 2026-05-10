"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  KnowledgeItem,
  KnowledgeFolder,
  KnowledgeKind,
  KnowledgeChunkSearchResult,
} from "@/lib/knowledge/types";
import { collectDescendantIds, isDescendant } from "@/lib/knowledge/tree";
import { logAudit } from "@/lib/audit/log";
import { completeItem } from "@/lib/onboarding/progress";
import { useRealtimeSync } from "./use-realtime-sync";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

export function useKnowledge() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [searchSnippets, setSearchSnippets] = useState<
    Record<string, KnowledgeChunkSearchResult[]>
  >({});
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderId, setFolderIdState] = useState(
    searchParams.get("folder") || "all"
  );
  const [search, setSearchState] = useState(searchParams.get("q") || "");
  const [kindFilter, setKindFilterState] = useState(
    searchParams.get("kind") || "all"
  );
  const [scopeFilter, setScopeFilterState] = useState(
    searchParams.get("scope") || "all"
  );
  const [showArchived, setShowArchivedState] = useState(
    searchParams.get("archived") === "1"
  );

  const supabase = useMemo(() => createClient(), []);
  const foldersRef = useRef<KnowledgeFolder[]>([]);
  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);

  const updateUrl = useCallback(
    (overrides: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(overrides)) {
        if (value === null || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  function setFolderId(value: string) {
    setFolderIdState(value);
    updateUrl({ folder: value === "all" ? null : value });
  }

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function setSearch(value: string) {
    setSearchState(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      updateUrl({ q: value || null });
    }, 250);
  }

  function setKindFilter(value: string) {
    setKindFilterState(value);
    updateUrl({ kind: value === "all" ? null : value });
  }

  function setScopeFilter(value: string) {
    setScopeFilterState(value);
    updateUrl({ scope: value === "all" ? null : value });
  }

  function setShowArchived(value: boolean) {
    setShowArchivedState(value);
    updateUrl({ archived: value ? "1" : null });
  }

  const fetchFolders = useCallback(async () => {
    const { data } = await supabase
      .from("knowledge_folders")
      .select("*")
      .order("sort_order", { ascending: true });
    if (data) setFolders(data as KnowledgeFolder[]);
  }, [supabase]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const trimmedSearch = search.trim();

    if (trimmedSearch) {
      const { data } = await supabase.rpc("search_knowledge_items_text", {
        query_text: trimmedSearch,
        match_count: 50,
        filter_folder_id: folderId !== "all" ? folderId : null,
        filter_kind: kindFilter !== "all" ? kindFilter : null,
      });

      let results = (data ?? []).map(
        (r: { id: string; title: string; kind: string; content: unknown; tags: string[]; folder_id: string | null; scope: string; updated_at: string; meta: Record<string, unknown>; similarity: number }) => ({
          ...r,
          pinned: false,
          archived_at: null,
        })
      ) as unknown as KnowledgeItem[];

      if (scopeFilter === "workspace") {
        results = results.filter((item) => item.scope === "workspace");
      } else if (scopeFilter !== "all") {
        const { data: junctionRows } = await supabase
          .from("knowledge_item_agents")
          .select("knowledge_item_id")
          .eq("agent_id", scopeFilter);
        const agentItemIds = new Set(
          (junctionRows ?? []).map(
            (r: { knowledge_item_id: string }) => r.knowledge_item_id
          )
        );
        results = results.filter((item) => agentItemIds.has(item.id));
      }

      setItems(results);

      const itemIds = results.map((r) => r.id);
      if (itemIds.length > 0) {
        const { data: chunks } = await supabase
          .from("knowledge_chunks")
          .select("id, knowledge_item_id, chunk_index, content")
          .in("knowledge_item_id", itemIds)
          .textSearch("content", trimmedSearch, { type: "plain" })
          .limit(20);

        const snippets: Record<string, KnowledgeChunkSearchResult[]> = {};
        for (const chunk of chunks ?? []) {
          const itemId = chunk.knowledge_item_id as string;
          if (!snippets[itemId]) snippets[itemId] = [];
          snippets[itemId].push({
            knowledge_item_id: itemId,
            title: "",
            tags: [],
            folder_id: null,
            chunk_id: chunk.id as string,
            chunk_index: chunk.chunk_index as number,
            content: (chunk.content as string).slice(0, 200),
            char_start: null,
            char_end: null,
            page_number: null,
            section_path: null,
            meta: {},
            updated_at: "",
            similarity: 0,
          });
        }
        setSearchSnippets(snippets);
      } else {
        setSearchSnippets({});
      }
    } else {
      setSearchSnippets({});

      let query = supabase
        .from("knowledge_items")
        .select("*, folder:knowledge_folders(id, name)")
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });

      if (showArchived) {
        query = query.not("archived_at", "is", null);
      } else {
        query = query.is("archived_at", null);
      }

      if (kindFilter !== "all") {
        query = query.eq("kind", kindFilter);
      }

      if (scopeFilter !== "all" && scopeFilter !== "workspace") {
        query = query.eq("scope", "agent");
      } else if (scopeFilter === "workspace") {
        query = query.eq("scope", "workspace");
      }

      if (folderId !== "all") {
        const ids = collectDescendantIds(foldersRef.current, folderId);
        query = query.in("folder_id", ids);
      }

      const { data, error } = await query;
      if (!error && data) {
        let filtered = data as unknown as KnowledgeItem[];

        if (scopeFilter !== "all" && scopeFilter !== "workspace") {
          const { data: junctionRows } = await supabase
            .from("knowledge_item_agents")
            .select("knowledge_item_id")
            .eq("agent_id", scopeFilter);
          const agentItemIds = new Set(
            (junctionRows ?? []).map(
              (r: { knowledge_item_id: string }) => r.knowledge_item_id
            )
          );
          filtered = filtered.filter((item) => agentItemIds.has(item.id));
        }

        setItems(filtered);
      }
    }
    setLoading(false);
  }, [supabase, folderId, search, kindFilter, scopeFilter, showArchived]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchFolders();
    fetchItems();
  }, [fetchFolders, fetchItems]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useRealtimeSync<KnowledgeItem>({
    table: "knowledge_items",
    select: "*, folder:knowledge_folders(id, name)",
    items,
    setItems,
  });

  useRealtime({
    table: "knowledge_folders",
    onPayload: (payload) => {
      if (payload.eventType === "INSERT") {
        const row = payload.new as unknown as KnowledgeFolder;
        setFolders((prev) => {
          if (prev.some((f) => f.id === row.id)) return prev;
          return [...prev, row].sort((a, b) => a.sort_order - b.sort_order);
        });
      } else if (payload.eventType === "UPDATE") {
        const row = payload.new as unknown as KnowledgeFolder;
        setFolders((prev) => prev.map((f) => (f.id === row.id ? row : f)));
      } else if (payload.eventType === "DELETE") {
        const oldId = (payload.old as Record<string, unknown>).id as string;
        setFolders((prev) => prev.filter((f) => f.id !== oldId));
      }
    },
  });

  async function createItem(input: {
    kind: KnowledgeKind;
    title: string;
    folderId?: string | null;
    scope?: "workspace" | "agent";
    agentIds?: string[];
  }) {
    const { data, error } = await supabase
      .from("knowledge_items")
      .insert({
        kind: input.kind,
        title: input.title,
        folder_id: input.folderId || null,
        scope: input.scope ?? "workspace",
        content: input.kind === "page" || input.kind === "skill" ? "" : null,
        embedding_status: "pending",
        chunk_status: "pending",
      })
      .select()
      .single();

    if (!error && data) {
      if (input.scope === "agent" && input.agentIds?.length) {
        await supabase.from("knowledge_item_agents").insert(
          input.agentIds.map((agentId) => ({
            knowledge_item_id: data.id,
            agent_id: agentId,
          }))
        );
      }

      logAudit(supabase, {
        module: "knowledge",
        entity_type: "knowledge_item",
        entity_id: data.id,
        action: "created",
        summary: `Created ${input.kind} '${input.title}'`,
      });
      completeItem("knowledgeCreated");
      fetchItems();
      return data as unknown as KnowledgeItem;
    }
    return null;
  }

  async function importFiles(files: File[], targetFolderId: string | null) {
    let count = 0;
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "md" || ext === "markdown" || ext === "txt") {
        const text = await file.text();
        const title = file.name.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]+/g, " ").trim() || "Untitled";
        const { data, error } = await supabase
          .from("knowledge_items")
          .insert({
            kind: "page",
            title,
            content: text,
            folder_id: targetFolderId,
            embedding_status: "pending",
            chunk_status: "pending",
          })
          .select("id")
          .single();

        if (!error && data) {
          logAudit(supabase, {
            module: "knowledge",
            entity_type: "knowledge_item",
            entity_id: data.id,
            action: "created",
            summary: `Imported '${title}'`,
          });
          count++;
        }
      } else {
        const itemId = crypto.randomUUID();
        const storagePath = `knowledge/${itemId}/${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("assets")
          .upload(storagePath, file);
        if (uploadError) continue;

        const { data, error } = await supabase
          .from("knowledge_items")
          .insert({
            id: itemId,
            kind: "file",
            title: file.name,
            mime_type: file.type || null,
            file_url: storagePath,
            file_size: file.size,
            folder_id: targetFolderId,
            processing_status: "ready",
            embedding_status: "pending",
            chunk_status: "pending",
          })
          .select("id")
          .single();

        if (!error && data) {
          logAudit(supabase, {
            module: "knowledge",
            entity_type: "knowledge_item",
            entity_id: data.id,
            action: "uploaded",
            summary: `Uploaded '${file.name}'`,
          });
          count++;
        }
      }
    }
    if (count > 0) fetchItems();
    return count;
  }

  async function importMarkdown(
    mdItems: { title: string; content: string }[],
    targetFolderId: string | null
  ) {
    const rows = mdItems.map((item) => ({
      kind: "page" as const,
      title: item.title,
      content: item.content,
      folder_id: targetFolderId || null,
      embedding_status: "pending" as const,
      chunk_status: "pending" as const,
    }));

    const { data, error } = await supabase
      .from("knowledge_items")
      .insert(rows)
      .select();

    if (!error && data) {
      for (const item of data) {
        logAudit(supabase, {
          module: "knowledge",
          entity_type: "knowledge_item",
          entity_id: item.id,
          action: "created",
          summary: `Imported '${item.title}'`,
        });
      }
      fetchItems();
      return data.length;
    }
    return 0;
  }

  async function archiveItem(id: string) {
    const item = items.find((i) => i.id === id);
    await supabase
      .from("knowledge_items")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    logAudit(supabase, {
      module: "knowledge",
      entity_type: "knowledge_item",
      entity_id: id,
      action: "archived",
      summary: `Archived '${item?.title ?? id}'`,
    });
    fetchItems();
    toast("Item archived", {
      action: { label: "Undo", onClick: () => restoreItem(id) },
    });
  }

  async function restoreItem(id: string) {
    const item = items.find((i) => i.id === id);
    await supabase
      .from("knowledge_items")
      .update({ archived_at: null })
      .eq("id", id);
    logAudit(supabase, {
      module: "knowledge",
      entity_type: "knowledge_item",
      entity_id: id,
      action: "restored",
      summary: `Restored '${item?.title ?? id}'`,
    });
    fetchItems();
    toast.success("Item restored");
  }

  async function deleteItem(id: string) {
    const item = items.find((i) => i.id === id);
    await supabase.from("knowledge_items").delete().eq("id", id);
    logAudit(supabase, {
      module: "knowledge",
      entity_type: "knowledge_item",
      entity_id: id,
      action: "deleted",
      summary: `Deleted '${item?.title ?? id}'`,
    });
    fetchItems();
  }

  async function updateScope(
    id: string,
    scope: "workspace" | "agent",
    agentIds?: string[]
  ) {
    await supabase.from("knowledge_items").update({ scope }).eq("id", id);

    await supabase
      .from("knowledge_item_agents")
      .delete()
      .eq("knowledge_item_id", id);

    if (scope === "agent" && agentIds?.length) {
      await supabase.from("knowledge_item_agents").insert(
        agentIds.map((agentId) => ({
          knowledge_item_id: id,
          agent_id: agentId,
        }))
      );
    }

    logAudit(supabase, {
      module: "knowledge",
      entity_type: "knowledge_item",
      entity_id: id,
      action: "updated",
      summary: `Updated scope to '${scope}'`,
    });
    fetchItems();
  }

  async function createFolder(name: string, parentId?: string) {
    await supabase
      .from("knowledge_folders")
      .insert({ name, parent_id: parentId || null });
    fetchFolders();
  }

  async function renameFolder(id: string, name: string) {
    const prev = folders.find((f) => f.id === id);
    if (!prev || prev.name === name) return;
    const { error } = await supabase
      .from("knowledge_folders")
      .update({ name })
      .eq("id", id);
    if (error) {
      toast.error("Failed to rename folder");
      return;
    }
    logAudit(supabase, {
      module: "knowledge",
      entity_type: "folder",
      entity_id: id,
      action: "updated",
      summary: `Renamed folder '${prev.name}' to '${name}'`,
    });
    fetchFolders();
  }

  async function deleteFolder(id: string) {
    const folder = folders.find((f) => f.id === id);
    if (!folder) return;
    const { error } = await supabase
      .from("knowledge_folders")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete folder");
      return;
    }
    logAudit(supabase, {
      module: "knowledge",
      entity_type: "folder",
      entity_id: id,
      action: "deleted",
      summary: `Deleted folder '${folder.name}'`,
    });
    if (
      folderId === id ||
      collectDescendantIds(folders, id).includes(folderId)
    ) {
      setFolderId("all");
    }
    fetchFolders();
    fetchItems();
  }

  async function moveFolder(id: string, newParentId: string | null) {
    if (id === newParentId) return;
    if (newParentId && isDescendant(folders, id, newParentId)) {
      toast.error("Can't move a folder into its own descendant");
      return;
    }
    const folder = folders.find((f) => f.id === id);
    const { error } = await supabase
      .from("knowledge_folders")
      .update({ parent_id: newParentId })
      .eq("id", id);
    if (error) {
      toast.error("Failed to move folder");
      return;
    }
    logAudit(supabase, {
      module: "knowledge",
      entity_type: "folder",
      entity_id: id,
      action: "updated",
      summary: `Moved folder '${folder?.name ?? id}'`,
    });
    fetchFolders();
  }

  async function moveItem(id: string, newFolderId: string | null) {
    const item = items.find((i) => i.id === id);
    if (item && (item.folder_id ?? null) === newFolderId) return;
    const { error } = await supabase
      .from("knowledge_items")
      .update({ folder_id: newFolderId })
      .eq("id", id);
    if (error) {
      toast.error("Failed to move item");
      return;
    }
    logAudit(supabase, {
      module: "knowledge",
      entity_type: "knowledge_item",
      entity_id: id,
      action: "updated",
      summary: `Moved '${item?.title ?? id}'`,
    });
    fetchItems();
  }

  return {
    items,
    searchSnippets,
    folders,
    loading,
    filters: {
      folderId,
      setFolderId,
      search,
      setSearch,
      kindFilter,
      setKindFilter,
      scopeFilter,
      setScopeFilter,
      showArchived,
      setShowArchived,
    },
    actions: {
      fetchItems,
      createItem,
      importFiles,
      importMarkdown,
      archiveItem,
      restoreItem,
      deleteItem,
      updateScope,
      createFolder,
      renameFolder,
      deleteFolder,
      moveFolder,
      moveItem,
    },
  };
}
