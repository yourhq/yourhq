"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Organization } from "@/lib/organizations/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtimeSync } from "./use-realtime-sync";
import { toast } from "sonner";

export function useOrganizations() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilterState] = useState(
    searchParams.get("q") || ""
  );
  const [typeFilter, setTypeFilterState] = useState(
    searchParams.get("type") || "all"
  );
  const [showArchived, setShowArchivedState] = useState(
    searchParams.get("archived") === "1"
  );
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);

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

  function setTypeFilter(value: string) {
    setTypeFilterState(value);
    updateUrl({ type: value === "all" ? null : value });
  }

  function setShowArchived(value: boolean) {
    setShowArchivedState(value);
    updateUrl({ archived: value ? "1" : null });
  }

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });

    if (showArchived) {
      query = query.not("archived_at", "is", null);
    } else {
      query = query.is("archived_at", null);
    }

    if (typeFilter !== "all") {
      query = query.eq("type", typeFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setOrganizations(data as Organization[]);
    }
    setLoading(false);
  }, [supabase, typeFilter, showArchived]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOrganizations();
  }, [fetchOrganizations]);

  useRealtimeSync<Organization>({
    table: "organizations",
    select: "*",
    items: organizations,
    setItems: setOrganizations,
  });

  const filteredOrganizations = useMemo(() => {
    if (!globalFilter.trim()) return organizations;
    const q = globalFilter.toLowerCase();
    return organizations.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.industry?.toLowerCase().includes(q) ||
        o.location?.toLowerCase().includes(q) ||
        o.tags?.some((t) => t.toLowerCase().includes(q))
    );
  }, [organizations, globalFilter]);

  async function handleArchiveOrg(id: string) {
    const org = organizations.find((o) => o.id === id);
    await supabase
      .from("organizations")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "organization",
      entity_id: id,
      action: "archived",
      summary: `Archived organization '${org?.name ?? id}'`,
    });
    setSelectedOrg(null);
    fetchOrganizations();
    toast("Organization archived", {
      action: { label: "Undo", onClick: () => handleRestoreOrg(id) },
    });
  }

  async function handleRestoreOrg(id: string) {
    const org = organizations.find((o) => o.id === id);
    await supabase
      .from("organizations")
      .update({ archived_at: null })
      .eq("id", id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "organization",
      entity_id: id,
      action: "restored",
      summary: `Restored organization '${org?.name ?? id}'`,
    });
    fetchOrganizations();
    toast.success("Organization restored");
  }

  async function handleDeleteOrg(id: string) {
    const org = organizations.find((o) => o.id === id);
    await supabase.from("organizations").delete().eq("id", id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "organization",
      entity_id: id,
      action: "deleted",
      summary: `Deleted organization '${org?.name ?? id}'`,
    });
    setSelectedOrg(null);
    fetchOrganizations();
  }

  function openCreateForm() {
    setEditingOrg(null);
    setShowForm(true);
  }

  function openEditForm(org: Organization) {
    setEditingOrg(org);
    setShowForm(true);
    setSelectedOrg(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingOrg(null);
  }

  function onFormSaved() {
    closeForm();
    fetchOrganizations();
  }

  const hasActiveFilters =
    typeFilter !== "all" || showArchived || globalFilter !== "";

  function clearFilters() {
    setTypeFilterState("all");
    setShowArchivedState(false);
    setGlobalFilterState("");
    router.replace(pathname, { scroll: false });
  }

  return {
    organizations: filteredOrganizations,
    allOrganizations: organizations,
    loading,
    filters: {
      globalFilter,
      setGlobalFilter,
      typeFilter,
      setTypeFilter,
      showArchived,
      setShowArchived,
      hasActiveFilters,
      clearFilters,
    },
    actions: {
      fetchOrganizations,
      handleArchiveOrg,
      handleRestoreOrg,
      handleDeleteOrg,
    },
    selection: {
      selectedOrg,
      setSelectedOrg,
    },
    form: {
      showForm,
      editingOrg,
      openCreateForm,
      openEditForm,
      closeForm,
      onFormSaved,
    },
  };
}
