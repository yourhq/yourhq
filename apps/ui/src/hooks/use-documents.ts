"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Document, DocumentFolder } from "@/lib/documents/types";
import { collectDescendantIds, isDescendant } from "@/lib/documents/tree";
import { logAudit } from "@/lib/audit/log";
import { useRealtimeSync } from "./use-realtime-sync";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

export function useDocuments() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderId, setFolderIdState] = useState(searchParams.get("folder") || "all");
  const [search, setSearchState] = useState(searchParams.get("q") || "");
  const [bootFilter, setBootFilterState] = useState(searchParams.get("boot") || "all");
  const [showArchived, setShowArchivedState] = useState(searchParams.get("archived") === "1");

  const supabase = useMemo(() => createClient(), []);
  const foldersRef = useRef<DocumentFolder[]>([]);
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

  function setSearch(value: string) {
    setSearchState(value);
    updateUrl({ q: value || null });
  }

  function setBootFilter(value: string) {
    setBootFilterState(value);
    updateUrl({ boot: value === "all" ? null : value });
  }

  function setShowArchived(value: boolean) {
    setShowArchivedState(value);
    updateUrl({ archived: value ? "1" : null });
  }

  const fetchFolders = useCallback(async () => {
    const { data } = await supabase
      .from("document_folders")
      .select("*")
      .order("sort_order", { ascending: true });
    if (data) setFolders(data as DocumentFolder[]);
  }, [supabase]);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("documents")
      .select("*, folder:document_folders(id, name)")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });

    if (showArchived) {
      query = query.not("archived_at", "is", null);
    } else {
      query = query.is("archived_at", null);
    }

    if (folderId !== "all") {
      const ids = collectDescendantIds(foldersRef.current, folderId);
      query = query.in("folder_id", ids);
    }

    const { data, error } = await query;
    if (!error && data) {
      let filtered = data as unknown as Document[];
      if (search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.tags?.some((t) => t.toLowerCase().includes(q))
        );
      }
      if (bootFilter !== "all") {
        if (bootFilter === "boot:none") {
          filtered = filtered.filter(
            (d) => !d.tags?.some((t) => t.startsWith("boot:"))
          );
        } else {
          filtered = filtered.filter(
            (d) => d.tags?.includes(bootFilter)
          );
        }
      }
      setDocuments(filtered);
    }
    setLoading(false);
  }, [supabase, folderId, search, bootFilter, showArchived]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFolders();
    fetchDocuments();
  }, [fetchFolders, fetchDocuments]);

  // Real-time: sync documents via single-row refetch (has folder JOIN)
  useRealtimeSync<Document>({
    table: "documents",
    select: "*, folder:document_folders(id, name)",
    items: documents,
    setItems: setDocuments,
  });

  // Real-time: sync document folders (no JOINs, direct merge)
  useRealtime({
    table: "document_folders",
    onPayload: (payload) => {
      if (payload.eventType === "INSERT") {
        const row = payload.new as unknown as DocumentFolder;
        setFolders((prev) => {
          if (prev.some((f) => f.id === row.id)) return prev;
          return [...prev, row].sort((a, b) => a.sort_order - b.sort_order);
        });
      } else if (payload.eventType === "UPDATE") {
        const row = payload.new as unknown as DocumentFolder;
        setFolders((prev) => prev.map((f) => (f.id === row.id ? row : f)));
      } else if (payload.eventType === "DELETE") {
        const oldId = (payload.old as Record<string, unknown>).id as string;
        setFolders((prev) => prev.filter((f) => f.id !== oldId));
      }
    },
  });

  async function createDocument(title: string, folderId?: string | null) {
    const { data, error } = await supabase
      .from("documents")
      .insert({
        title,
        folder_id: folderId || null,
        content: "",
        embedding_status: "pending",
      })
      .select()
      .single();

    if (!error && data) {
      logAudit(supabase, {
        module: "documents",
        entity_type: "document",
        entity_id: data.id,
        action: "created",
        summary: `Created document '${title}'`,
      });
      fetchDocuments();
      return data as unknown as Document;
    }
    return null;
  }

  async function importDocuments(
    items: Array<{ title: string; content: string }>,
    folderId?: string | null
  ) {
    const rows = items.map((item) => ({
      title: item.title,
      content: item.content,
      folder_id: folderId || null,
      embedding_status: "pending",
    }));

    const { data, error } = await supabase
      .from("documents")
      .insert(rows)
      .select();

    if (!error && data) {
      for (const doc of data) {
        logAudit(supabase, {
          module: "documents",
          entity_type: "document",
          entity_id: doc.id,
          action: "created",
          summary: `Imported document '${doc.title}'`,
        });
      }
      fetchDocuments();
      return data.length;
    }
    return 0;
  }

  async function archiveDocument(id: string) {
    const doc = documents.find((d) => d.id === id);
    await supabase.from("documents").update({ archived_at: new Date().toISOString() }).eq("id", id);
    logAudit(supabase, {
      module: "documents",
      entity_type: "document",
      entity_id: id,
      action: "archived",
      summary: `Archived document '${doc?.title ?? id}'`,
    });
    fetchDocuments();
    toast("Document archived", {
      action: { label: "Undo", onClick: () => restoreDocument(id) },
    });
  }

  async function restoreDocument(id: string) {
    const doc = documents.find((d) => d.id === id);
    await supabase.from("documents").update({ archived_at: null }).eq("id", id);
    logAudit(supabase, {
      module: "documents",
      entity_type: "document",
      entity_id: id,
      action: "restored",
      summary: `Restored document '${doc?.title ?? id}'`,
    });
    fetchDocuments();
    toast.success("Document restored");
  }

  async function deleteDocument(id: string) {
    const doc = documents.find((d) => d.id === id);
    await supabase.from("documents").delete().eq("id", id);
    logAudit(supabase, {
      module: "documents",
      entity_type: "document",
      entity_id: id,
      action: "deleted",
      summary: `Deleted document '${doc?.title ?? id}'`,
    });
    fetchDocuments();
  }

  async function createFolder(name: string, parentId?: string) {
    await supabase.from("document_folders").insert({
      name,
      parent_id: parentId || null,
    });
    fetchFolders();
  }

  async function renameFolder(id: string, name: string) {
    const prev = folders.find((f) => f.id === id);
    if (!prev || prev.name === name) return;
    const { error } = await supabase
      .from("document_folders")
      .update({ name })
      .eq("id", id);
    if (error) {
      toast.error("Failed to rename folder");
      return;
    }
    logAudit(supabase, {
      module: "documents",
      entity_type: "folder",
      entity_id: id,
      action: "updated",
      summary: `Renamed folder '${prev.name}' to '${name}'`,
    });
    fetchFolders();
  }

  async function updateFolderIcon(id: string, icon: string | null) {
    const folder = folders.find((f) => f.id === id);
    if (!folder) return;
    const { error } = await supabase
      .from("document_folders")
      .update({ icon })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update icon");
      return;
    }
    logAudit(supabase, {
      module: "documents",
      entity_type: "folder",
      entity_id: id,
      action: "updated",
      summary: `Updated icon for folder '${folder.name}'`,
    });
    fetchFolders();
  }

  async function deleteFolder(id: string) {
    const folder = folders.find((f) => f.id === id);
    if (!folder) return;
    const { error } = await supabase.from("document_folders").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete folder");
      return;
    }
    logAudit(supabase, {
      module: "documents",
      entity_type: "folder",
      entity_id: id,
      action: "deleted",
      summary: `Deleted folder '${folder.name}'`,
    });
    // If the deleted folder (or an ancestor) was selected, fall back to All.
    if (folderId === id || collectDescendantIds(folders, id).includes(folderId)) {
      setFolderId("all");
    }
    fetchFolders();
    fetchDocuments();
  }

  async function moveFolder(id: string, newParentId: string | null) {
    if (id === newParentId) return;
    if (newParentId && isDescendant(folders, id, newParentId)) {
      toast.error("Can't move a folder into its own descendant");
      return;
    }
    const folder = folders.find((f) => f.id === id);
    const { error } = await supabase
      .from("document_folders")
      .update({ parent_id: newParentId })
      .eq("id", id);
    if (error) {
      toast.error("Failed to move folder");
      return;
    }
    logAudit(supabase, {
      module: "documents",
      entity_type: "folder",
      entity_id: id,
      action: "updated",
      summary: `Moved folder '${folder?.name ?? id}'`,
    });
    fetchFolders();
  }

  async function moveDocument(id: string, newFolderId: string | null) {
    const doc = documents.find((d) => d.id === id);
    if (doc && (doc.folder_id ?? null) === newFolderId) return;
    const { error } = await supabase
      .from("documents")
      .update({ folder_id: newFolderId })
      .eq("id", id);
    if (error) {
      toast.error("Failed to move document");
      return;
    }
    logAudit(supabase, {
      module: "documents",
      entity_type: "document",
      entity_id: id,
      action: "updated",
      summary: `Moved document '${doc?.title ?? id}'`,
    });
    fetchDocuments();
  }

  return {
    documents,
    folders,
    loading,
    filters: {
      folderId,
      setFolderId,
      search,
      setSearch,
      bootFilter,
      setBootFilter,
      showArchived,
      setShowArchived,
    },
    actions: {
      fetchDocuments,
      createDocument,
      importDocuments,
      archiveDocument,
      restoreDocument,
      deleteDocument,
      createFolder,
      renameFolder,
      deleteFolder,
      updateFolderIcon,
      moveFolder,
      moveDocument,
    },
  };
}
