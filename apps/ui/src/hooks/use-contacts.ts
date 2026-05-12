"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SortingState } from "@tanstack/react-table";
import { Contact, Campaign } from "@/lib/crm/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtimeSync } from "./use-realtime-sync";
import { toast } from "sonner";

export type ViewMode = "table" | "cards" | "kanban";

export function useContacts() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilterState] = useState(searchParams.get("q") || "");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [statusFilter, setStatusFilterState] = useState(searchParams.get("status") || "all");
  const [priorityFilter, setPriorityFilterState] = useState(
    searchParams.get("priority") || "all"
  );
  const [followUpFilter, setFollowUpFilterState] = useState(searchParams.get("due") === "1");
  const [showArchived, setShowArchivedState] = useState(searchParams.get("archived") === "1");
  const [followUpContactIds, setFollowUpContactIds] = useState<Set<string> | null>(null);
  const [sorting, setSortingState] = useState<SortingState>(() => {
    const sortParam = searchParams.get("sort");
    const dirParam = searchParams.get("dir");
    if (sortParam) {
      return [{ id: sortParam, desc: dirParam === "desc" }];
    }
    return [];
  });
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("crm-view-mode") as ViewMode) || "table";
    }
    return "table";
  });

  const supabase = useMemo(() => createClient(), []);

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

  function setGlobalFilter(value: string) {
    setGlobalFilterState(value);
    updateUrl({ q: value || null });
  }

  function setStatusFilter(value: string) {
    setStatusFilterState(value);
    updateUrl({ status: value === "all" ? null : value });
  }

  function setPriorityFilter(value: string) {
    setPriorityFilterState(value);
    updateUrl({ priority: value === "all" ? null : value });
  }

  function setFollowUpFilter(value: boolean) {
    setFollowUpFilterState(value);
    updateUrl({ due: value ? "1" : null });
  }

  function setShowArchived(value: boolean) {
    setShowArchivedState(value);
    updateUrl({ archived: value ? "1" : null });
  }

  function setSorting(updater: SortingState | ((prev: SortingState) => SortingState)) {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    setSortingState(next);
    if (next.length > 0) {
      updateUrl({ sort: next[0].id, dir: next[0].desc ? "desc" : "asc" });
    } else {
      updateUrl({ sort: null, dir: null });
    }
  }

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("crm-view-mode", mode);
    }
  }

  // Fetch contact IDs with interactions where next_action_date <= now.
  // This powers the "follow-ups due" filter.
  const fetchFollowUpIds = useCallback(async () => {
    if (!followUpFilter) {
      setFollowUpContactIds(null);
      return;
    }
    const { data } = await supabase
      .from("interactions")
      .select("contact_id")
      .not("next_action_date", "is", null)
      .lte("next_action_date", new Date().toISOString());
    const ids = new Set<string>((data ?? []).map((r: { contact_id: string }) => r.contact_id));
    setFollowUpContactIds(ids);
  }, [supabase, followUpFilter]);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("contacts")
      .select("*, campaign:campaigns(id, name)")
      .order("created_at", { ascending: false });

    if (showArchived) {
      query = query.not("archived_at", "is", null);
    } else {
      query = query.is("archived_at", null);
    }

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (priorityFilter !== "all") {
      query = query.eq("priority", priorityFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setContacts(data as Contact[]);
    }
    setLoading(false);
  }, [supabase, statusFilter, priorityFilter, showArchived]);

  const fetchCampaigns = useCallback(async () => {
    const { data } = await supabase
      .from("campaigns")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (data) setCampaigns(data as Campaign[]);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContacts();
    fetchCampaigns();
  }, [fetchContacts, fetchCampaigns]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFollowUpIds();
  }, [fetchFollowUpIds]);

  // Real-time: sync contacts via single-row refetch (has campaign JOIN)
  useRealtimeSync<Contact>({
    table: "contacts",
    select: "*, campaign:campaigns(id, name)",
    items: contacts,
    setItems: setContacts,
  });

  // Client-side global text filter + follow-up filter
  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (followUpFilter && followUpContactIds) {
      list = list.filter((c) => followUpContactIds.has(c.id));
    }
    if (globalFilter.trim()) {
      const q = globalFilter.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q) ||
          c.title?.toLowerCase().includes(q) ||
          c.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [contacts, globalFilter, followUpFilter, followUpContactIds]);

  async function handleArchiveContact(id: string) {
    const contact = contacts.find((c) => c.id === id);
    await supabase.from("contacts").update({ archived_at: new Date().toISOString() }).eq("id", id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "contact",
      entity_id: id,
      action: "archived",
      summary: `Archived contact '${contact?.name ?? id}'`,
    });
    setSelectedContact(null);
    fetchContacts();
    toast("Contact archived", {
      action: { label: "Undo", onClick: () => handleRestoreContact(id) },
    });
  }

  async function handleRestoreContact(id: string) {
    const contact = contacts.find((c) => c.id === id);
    await supabase.from("contacts").update({ archived_at: null }).eq("id", id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "contact",
      entity_id: id,
      action: "restored",
      summary: `Restored contact '${contact?.name ?? id}'`,
    });
    fetchContacts();
    toast.success("Contact restored");
  }

  async function handleDeleteContact(id: string) {
    const contact = contacts.find((c) => c.id === id);
    await supabase.from("contacts").delete().eq("id", id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "contact",
      entity_id: id,
      action: "deleted",
      summary: `Deleted contact '${contact?.name ?? id}'`,
    });
    setSelectedContact(null);
    fetchContacts();
  }

  async function handleStatusChange(id: string, status: string) {
    const contact = contacts.find((c) => c.id === id);
    const oldStatus = contact?.status;
    await supabase
      .from("contacts")
      .update({ status, status_changed_at: new Date().toISOString() })
      .eq("id", id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "contact",
      entity_id: id,
      action: "status_changed",
      summary: `Changed contact '${contact?.name ?? id}' status from ${oldStatus} to ${status}`,
      changes: { status: { old: oldStatus, new: status } },
    });
    fetchContacts();
    if (selectedContact?.id === id) {
      setSelectedContact({ ...selectedContact, status });
    }
  }

  async function handleBulkArchive(ids: string[]) {
    if (ids.length === 0) return;
    await supabase
      .from("contacts")
      .update({ archived_at: new Date().toISOString() })
      .in("id", ids);
    for (const id of ids) {
      logAudit(supabase, {
        module: "crm",
        entity_type: "contact",
        entity_id: id,
        action: "archived",
        summary: `Bulk archived contact`,
      });
    }
    setSelectedContact(null);
    fetchContacts();
    toast(`Archived ${ids.length} contact${ids.length === 1 ? "" : "s"}`);
  }

  async function handleBulkDelete(ids: string[]) {
    if (ids.length === 0) return;
    await supabase.from("contacts").delete().in("id", ids);
    for (const id of ids) {
      logAudit(supabase, {
        module: "crm",
        entity_type: "contact",
        entity_id: id,
        action: "deleted",
        summary: `Bulk deleted contact`,
      });
    }
    setSelectedContact(null);
    fetchContacts();
    toast(`Deleted ${ids.length} contact${ids.length === 1 ? "" : "s"}`);
  }

  async function handleBulkStatusChange(ids: string[], status: string) {
    if (ids.length === 0) return;
    await supabase
      .from("contacts")
      .update({ status, status_changed_at: new Date().toISOString() })
      .in("id", ids);
    for (const id of ids) {
      logAudit(supabase, {
        module: "crm",
        entity_type: "contact",
        entity_id: id,
        action: "status_changed",
        summary: `Bulk changed contact status to ${status}`,
      });
    }
    fetchContacts();
    toast(`Updated ${ids.length} contact${ids.length === 1 ? "" : "s"}`);
  }

  function openCreateForm() {
    setEditingContact(null);
    setShowForm(true);
  }

  function openEditForm(contact: Contact) {
    setEditingContact(contact);
    setShowForm(true);
    setSelectedContact(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingContact(null);
  }

  function onFormSaved() {
    closeForm();
    fetchContacts();
  }

  const hasActiveFilters =
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    followUpFilter ||
    showArchived ||
    globalFilter !== "";

  function clearFilters() {
    setStatusFilterState("all");
    setPriorityFilterState("all");
    setFollowUpFilterState(false);
    setShowArchivedState(false);
    setGlobalFilterState("");
    setSortingState([]);
    router.replace(`${pathname}`, { scroll: false });
  }

  return {
    contacts: filteredContacts,
    allContacts: contacts,
    campaigns,
    loading,
    viewMode,
    changeViewMode,
    sorting,
    setSorting,
    filters: {
      globalFilter,
      setGlobalFilter,
      statusFilter,
      setStatusFilter,
      priorityFilter,
      setPriorityFilter,
      followUpFilter,
      setFollowUpFilter,
      showArchived,
      setShowArchived,
      hasActiveFilters,
      clearFilters,
    },
    actions: {
      fetchContacts,
      handleArchiveContact,
      handleRestoreContact,
      handleDeleteContact,
      handleStatusChange,
      handleBulkArchive,
      handleBulkDelete,
      handleBulkStatusChange,
    },
    selection: {
      selectedContact,
      setSelectedContact,
    },
    form: {
      showForm,
      editingContact,
      openCreateForm,
      openEditForm,
      closeForm,
      onFormSaved,
    },
  };
}
