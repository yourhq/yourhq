"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ContactOrganization } from "@/lib/organizations/types";
import type { Organization } from "@/lib/organizations/types";
import { logAudit } from "@/lib/audit/log";

export interface ContactOrgLink extends ContactOrganization {
  organization: Organization;
}

export function useContactOrganizations(contactId: string) {
  const [links, setLinks] = useState<ContactOrgLink[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("contact_organizations")
      .select("*, organization:organizations(*)")
      .eq("contact_id", contactId)
      .order("is_current", { ascending: false })
      .order("created_at", { ascending: false });
    if (data) setLinks(data as ContactOrgLink[]);
    setLoading(false);
  }, [supabase, contactId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLinks();
  }, [fetchLinks]);

  async function addLink(orgId: string, role?: string) {
    const { data: inserted, error } = await supabase
      .from("contact_organizations")
      .insert({ contact_id: contactId, org_id: orgId, role: role || null, is_current: true })
      .select("id")
      .single();
    if (error) return { error };
    logAudit(supabase, {
      module: "crm",
      entity_type: "contact_organization",
      entity_id: inserted.id,
      action: "created",
      summary: `Linked contact to organization`,
    });
    fetchLinks();
    return { error: null };
  }

  async function removeLink(linkId: string) {
    await supabase.from("contact_organizations").delete().eq("id", linkId);
    logAudit(supabase, {
      module: "crm",
      entity_type: "contact_organization",
      entity_id: linkId,
      action: "deleted",
      summary: `Removed contact-organization link`,
    });
    fetchLinks();
  }

  async function updateLink(linkId: string, updates: { role?: string | null; is_current?: boolean }) {
    const { error } = await supabase
      .from("contact_organizations")
      .update(updates)
      .eq("id", linkId);
    if (!error) fetchLinks();
    return { error };
  }

  async function searchOrganizations(query: string): Promise<Organization[]> {
    if (!query.trim()) return [];
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .ilike("name", `%${query.trim()}%`)
      .is("archived_at", null)
      .limit(8);
    return (data ?? []) as Organization[];
  }

  return { links, loading, addLink, removeLink, updateLink, searchOrganizations, fetchLinks };
}
