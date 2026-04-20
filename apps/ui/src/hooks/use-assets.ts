"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Asset, AssetFolder, AssetType } from "@/lib/assets/types";
import { collectDescendantIds, isDescendant } from "@/lib/shared/folder-tree";
import { logAudit } from "@/lib/audit/log";
import { uploadAssetFile, inferAssetType, formatFileSize } from "@/lib/assets/storage";
import { useRealtimeSync } from "./use-realtime-sync";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

export function useAssets() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [folderId, setFolderIdState] = useState(searchParams.get("folder") || "all");
  const [typeFilter, setTypeFilterState] = useState(searchParams.get("type") || "all");
  const [search, setSearchState] = useState(searchParams.get("q") || "");
  const [showArchived, setShowArchivedState] = useState(searchParams.get("archived") === "1");

  const supabase = useMemo(() => createClient(), []);
  const foldersRef = useRef<AssetFolder[]>([]);
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

  function setTypeFilter(value: string) {
    setTypeFilterState(value);
    updateUrl({ type: value === "all" ? null : value });
  }

  function setSearch(value: string) {
    setSearchState(value);
    updateUrl({ q: value || null });
  }

  function setShowArchived(value: boolean) {
    setShowArchivedState(value);
    updateUrl({ archived: value ? "1" : null });
  }

  const fetchFolders = useCallback(async () => {
    const { data } = await supabase
      .from("asset_folders")
      .select("*")
      .order("sort_order", { ascending: true });
    if (data) setFolders(data as AssetFolder[]);
  }, [supabase]);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("assets")
      .select("*, folder:asset_folders(id, name)")
      .order("created_at", { ascending: false });

    if (showArchived) {
      query = query.not("archived_at", "is", null);
    } else {
      query = query.is("archived_at", null);
    }

    if (folderId !== "all") {
      const ids = collectDescendantIds(foldersRef.current, folderId);
      query = query.in("folder_id", ids);
    }
    if (typeFilter !== "all") {
      query = query.eq("type", typeFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      let filtered = data as unknown as Asset[];
      if (search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.description?.toLowerCase().includes(q) ||
            a.tags?.some((t) => t.toLowerCase().includes(q))
        );
      }
      setAssets(filtered);
    }
    setLoading(false);
  }, [supabase, folderId, typeFilter, search, showArchived]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFolders();
    fetchAssets();
  }, [fetchFolders, fetchAssets]);

  // Real-time: sync assets via single-row refetch (has folder JOIN)
  useRealtimeSync<Asset>({
    table: "assets",
    select: "*, folder:asset_folders(id, name)",
    items: assets,
    setItems: setAssets,
  });

  // Real-time: sync asset folders (no JOINs, direct merge)
  useRealtime({
    table: "asset_folders",
    onPayload: (payload) => {
      if (payload.eventType === "INSERT") {
        const row = payload.new as unknown as AssetFolder;
        setFolders((prev) => {
          if (prev.some((f) => f.id === row.id)) return prev;
          return [...prev, row].sort((a, b) => a.sort_order - b.sort_order);
        });
      } else if (payload.eventType === "UPDATE") {
        const row = payload.new as unknown as AssetFolder;
        setFolders((prev) => prev.map((f) => (f.id === row.id ? row : f)));
      } else if (payload.eventType === "DELETE") {
        const oldId = (payload.old as Record<string, unknown>).id as string;
        setFolders((prev) => prev.filter((f) => f.id !== oldId));
      }
    },
  });

  async function createFolder(name: string, parentId?: string) {
    await supabase.from("asset_folders").insert({
      name,
      parent_id: parentId || null,
    });
    fetchFolders();
  }

  async function renameFolder(id: string, name: string) {
    const prev = folders.find((f) => f.id === id);
    if (!prev || prev.name === name) return;
    const { error } = await supabase
      .from("asset_folders")
      .update({ name })
      .eq("id", id);
    if (error) {
      toast.error("Failed to rename folder");
      return;
    }
    logAudit(supabase, {
      module: "assets",
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
    const { error } = await supabase.from("asset_folders").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete folder");
      return;
    }
    logAudit(supabase, {
      module: "assets",
      entity_type: "folder",
      entity_id: id,
      action: "deleted",
      summary: `Deleted folder '${folder.name}'`,
    });
    if (folderId === id || collectDescendantIds(folders, id).includes(folderId)) {
      setFolderId("all");
    }
    fetchFolders();
    fetchAssets();
  }

  async function moveFolder(id: string, newParentId: string | null) {
    if (id === newParentId) return;
    if (newParentId && isDescendant(folders, id, newParentId)) {
      toast.error("Can't move a folder into its own descendant");
      return;
    }
    const folder = folders.find((f) => f.id === id);
    const { error } = await supabase
      .from("asset_folders")
      .update({ parent_id: newParentId })
      .eq("id", id);
    if (error) {
      toast.error("Failed to move folder");
      return;
    }
    logAudit(supabase, {
      module: "assets",
      entity_type: "folder",
      entity_id: id,
      action: "updated",
      summary: `Moved folder '${folder?.name ?? id}'`,
    });
    fetchFolders();
  }

  async function moveAsset(id: string, newFolderId: string | null) {
    const asset = assets.find((a) => a.id === id);
    if (asset && (asset.folder_id ?? null) === newFolderId) return;
    const { error } = await supabase
      .from("assets")
      .update({ folder_id: newFolderId })
      .eq("id", id);
    if (error) {
      toast.error("Failed to move asset");
      return;
    }
    logAudit(supabase, {
      module: "assets",
      entity_type: "asset",
      entity_id: id,
      action: "updated",
      summary: `Moved asset '${asset?.name ?? id}'`,
    });
    fetchAssets();
  }

  async function archiveAsset(id: string) {
    const asset = assets.find((a) => a.id === id);
    await supabase.from("assets").update({ archived_at: new Date().toISOString() }).eq("id", id);
    logAudit(supabase, {
      module: "assets",
      entity_type: "asset",
      entity_id: id,
      action: "archived",
      summary: `Archived asset '${asset?.name ?? id}'`,
    });
    setSelectedAsset(null);
    fetchAssets();
    toast("Asset archived", {
      action: { label: "Undo", onClick: () => restoreAsset(id) },
    });
  }

  async function restoreAsset(id: string) {
    const asset = assets.find((a) => a.id === id);
    await supabase.from("assets").update({ archived_at: null }).eq("id", id);
    logAudit(supabase, {
      module: "assets",
      entity_type: "asset",
      entity_id: id,
      action: "restored",
      summary: `Restored asset '${asset?.name ?? id}'`,
    });
    fetchAssets();
    toast.success("Asset restored");
  }

  async function deleteAsset(id: string) {
    const asset = assets.find((a) => a.id === id);
    // Delete file from storage if it exists and is not a link
    if (asset?.file_url && asset.type !== "link") {
      await supabase.storage.from("assets").remove([asset.file_url]);
    }
    await supabase.from("assets").delete().eq("id", id);
    logAudit(supabase, {
      module: "assets",
      entity_type: "asset",
      entity_id: id,
      action: "deleted",
      summary: `Deleted asset '${asset?.name ?? id}'`,
    });
    setSelectedAsset(null);
    fetchAssets();
  }

  async function importFiles(files: File[], targetFolderId: string | null) {
    let successCount = 0;

    for (const file of files) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      const assetType: AssetType = inferAssetType(file.type);

      const { data: inserted, error: insertError } = await supabase
        .from("assets")
        .insert({
          name: nameWithoutExt,
          type: assetType,
          mime_type: file.type || null,
          file_size: file.size,
          folder_id: targetFolderId,
        })
        .select("id")
        .single();

      if (insertError || !inserted) continue;

      try {
        const storagePath = await uploadAssetFile(supabase, file, inserted.id);
        await supabase
          .from("assets")
          .update({ file_url: storagePath })
          .eq("id", inserted.id);

        logAudit(supabase, {
          module: "assets",
          entity_type: "asset",
          entity_id: inserted.id,
          action: "created",
          summary: `Imported file '${nameWithoutExt}' (${formatFileSize(file.size)})`,
        });
        successCount++;
      } catch {
        // Rollback: delete the asset row if upload fails
        await supabase.from("assets").delete().eq("id", inserted.id);
      }
    }

    if (successCount > 0) fetchAssets();
    return successCount;
  }

  function openCreateForm() {
    setEditingAsset(null);
    setShowForm(true);
  }

  function openUploadForm() {
    setShowUpload(true);
  }

  function openEditForm(asset: Asset) {
    setEditingAsset(asset);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setShowUpload(false);
    setEditingAsset(null);
  }

  function onFormSaved() {
    closeForm();
    fetchAssets();
  }

  return {
    assets,
    folders,
    loading,
    filters: {
      folderId,
      setFolderId,
      typeFilter,
      setTypeFilter,
      search,
      setSearch,
      showArchived,
      setShowArchived,
    },
    actions: {
      fetchAssets,
      createFolder,
      renameFolder,
      deleteFolder,
      moveFolder,
      moveAsset,
      archiveAsset,
      restoreAsset,
      deleteAsset,
      importFiles,
    },
    selection: {
      selectedAsset,
      setSelectedAsset,
    },
    form: {
      showForm,
      showUpload,
      editingAsset,
      openCreateForm,
      openUploadForm,
      openEditForm,
      closeForm,
      onFormSaved,
    },
  };
}
