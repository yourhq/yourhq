"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Contact,
  Campaign,
  PRIORITIES,
  PRIORITY_COLORS,
  RELATIONSHIP_STRENGTHS,
} from "@/lib/crm/types";
import type { Organization } from "@/lib/organizations/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import { DynamicFieldGroups } from "@/components/shared/dynamic-field-group";
import { logAudit } from "@/lib/audit/log";
import { SidePanel } from "@/components/shared/side-panel";
import { TagInput } from "@/components/ui/tag-input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { DEFAULT_STAGE_COLOR } from "@/lib/fields/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Building2, X, Search } from "lucide-react";

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 min-h-[28px]">
      <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function InlineInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-7 bg-transparent border-0 text-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:bg-accent/30 rounded px-1.5 -ml-1.5 transition-colors"
    />
  );
}

export function ContactForm({
  open,
  onClose,
  contact,
  campaigns,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  contact: Contact | null;
  campaigns: Campaign[];
  onSaved: () => void;
}) {
  const { stages, defaultStage, getStageColor } = usePipelineStages("contact");
  const { groupedFields } = useFieldDefinitions("contact");

  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [extended, setExtended] = useState<Record<string, unknown>>({});
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [orgQuery, setOrgQuery] = useState("");
  const [orgResults, setOrgResults] = useState<Organization[]>([]);
  const [orgSearching, setOrgSearching] = useState(false);
  const orgDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nameRef = useRef<HTMLTextAreaElement>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    title: "",
    location: "",
    linkedin_url: "",
    twitter_url: "",
    website_url: "",
    how_we_met: "",
    notes: "",
    status: "",
    priority: "medium",
    relationship_strength: "stranger",
    source: "",
    campaign_id: "",
  });

  const supabase = useMemo(() => createClient(), []);

  const searchOrgs = useCallback(async (q: string) => {
    if (!q.trim()) { setOrgResults([]); return; }
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .ilike("name", `%${q.trim()}%`)
      .is("archived_at", null)
      .limit(6);
    setOrgResults((data ?? []) as Organization[]);
  }, [supabase]);

  useEffect(() => {
    clearTimeout(orgDebounceRef.current);
    orgDebounceRef.current = setTimeout(() => searchOrgs(orgQuery), 200);
    return () => clearTimeout(orgDebounceRef.current);
  }, [orgQuery, searchOrgs]);

  // Load existing org link when editing
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!contact || !open) { setSelectedOrg(null); return; }
    (async () => {
      const { data } = await supabase
        .from("contact_organizations")
        .select("*, organization:organizations(*)")
        .eq("contact_id", contact.id)
        .eq("is_current", true)
        .limit(1)
        .maybeSingle();
      if (data?.organization) setSelectedOrg(data.organization as Organization);
    })();
  }, [contact, open, supabase]);

  // Reset form when opening / switching contact
  useEffect(() => {
    if (contact) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        name: contact.name,
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        company: contact.company ?? "",
        title: contact.title ?? "",
        location: contact.location ?? "",
        linkedin_url: contact.linkedin_url ?? "",
        twitter_url: contact.twitter_url ?? "",
        website_url: contact.website_url ?? "",
        how_we_met: contact.how_we_met ?? "",
        notes: contact.notes ?? "",
        status: contact.status,
        priority: contact.priority ?? "medium",
        relationship_strength: contact.relationship_strength ?? "stranger",
        source: contact.source ?? "",
        campaign_id: contact.campaign_id ?? "",
      });
      setTags(contact.tags ?? []);
      setExtended(contact.extended ?? {});
    } else {
      setForm({
        name: "",
        email: "",
        phone: "",
        company: "",
        title: "",
        location: "",
        linkedin_url: "",
        twitter_url: "",
        website_url: "",
        how_we_met: "",
        notes: "",
        status: defaultStage?.stage_key ?? "",
        priority: "medium",
        relationship_strength: "stranger",
        source: "",
        campaign_id: "",
      });
      setTags([]);
      setExtended({});
      setSelectedOrg(null);
    }
    setOrgQuery("");
    setOrgResults([]);
    setOrgSearching(false);
  }, [contact, open, defaultStage]);

  // Auto-resize name textarea
  useEffect(() => {
    if (nameRef.current) {
      nameRef.current.style.height = "auto";
      nameRef.current.style.height = nameRef.current.scrollHeight + "px";
    }
  }, [form.name]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) return;
    setSaving(true);

    const data = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      title: form.title.trim() || null,
      location: form.location.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      twitter_url: form.twitter_url.trim() || null,
      website_url: form.website_url.trim() || null,
      how_we_met: form.how_we_met.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status || defaultStage?.stage_key || "",
      priority: form.priority || null,
      relationship_strength: form.relationship_strength || "stranger",
      source: form.source.trim() || null,
      campaign_id: form.campaign_id || null,
      tags,
      extended,
      ...(contact ? {} : { status_changed_at: new Date().toISOString() }),
    };

    if (contact) {
      const { error } = await supabase.from("contacts").update(data).eq("id", contact.id);
      if (error) {
        toast.error("Failed to update contact");
      } else {
        logAudit(supabase, {
          module: "crm",
          entity_type: "contact",
          entity_id: contact.id,
          action: "updated",
          summary: `Updated contact '${data.name}'`,
        });
        toast.success("Contact updated");
      }
    } else {
      const { data: inserted, error } = await supabase
        .from("contacts")
        .insert(data)
        .select("id")
        .single();
      if (error) {
        toast.error("Failed to create contact");
      } else {
        logAudit(supabase, {
          module: "crm",
          entity_type: "contact",
          entity_id: inserted.id,
          action: "created",
          summary: `Created contact '${data.name}'`,
        });
        if (selectedOrg) {
          await supabase.from("contact_organizations").insert({
            contact_id: inserted.id,
            org_id: selectedOrg.id,
            is_current: true,
          });
        }
        toast.success("Contact created");
      }
    }

    setSaving(false);
    onSaved();
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (form.name.trim()) handleSubmit();
    }
  }

  const selectedStage = stages.find((s) => s.stage_key === form.status);
  const selectedPriority = PRIORITIES.find((p) => p.value === form.priority);
  const selectedStrength = RELATIONSHIP_STRENGTHS.find(
    (s) => s.value === form.relationship_strength
  );
  const selectedCampaign = campaigns.find((c) => c.id === form.campaign_id);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title=""
      className="sm:max-w-lg lg:max-w-xl"
      footer={
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground/50">
            Press Enter to {contact ? "save" : "create"}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={saving || !form.name.trim()}
            >
              {saving && <Spinner className="mr-1.5 h-3 w-3" />}
              {saving ? "Saving..." : contact ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="-mx-5 -my-5">
        {/* Hero - Name */}
        <div className="px-4 pt-4 pb-2">
          <textarea
            ref={nameRef}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            onKeyDown={handleNameKeyDown}
            placeholder={contact ? "Contact name" : "Who are you adding?"}
            autoFocus
            rows={1}
            className="w-full resize-none overflow-hidden border-0 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {(form.title || form.company) && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {form.title}
              {form.title && form.company && " · "}
              {form.company}
            </p>
          )}
        </div>

        {/* Primary property bar */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-4 py-2.5">
          {/* Status */}
          <Select value={form.status} onValueChange={(v) => update("status", v)}>
            <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: getStageColor(form.status) ?? DEFAULT_STAGE_COLOR }}
              />
              <span>{selectedStage?.label ?? "Status"}</span>
            </SelectTrigger>
            <SelectContent portal={false}>
              {stages.map((s) => (
                <SelectItem key={s.stage_key} value={s.stage_key}>
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: s.color ?? DEFAULT_STAGE_COLOR }}
                  />
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Priority */}
          <Select value={form.priority} onValueChange={(v) => update("priority", v)}>
            <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
              <span className={cn(PRIORITY_COLORS[form.priority])}>
                {selectedPriority?.label ?? "Priority"}
              </span>
            </SelectTrigger>
            <SelectContent portal={false}>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <span className={cn("capitalize", PRIORITY_COLORS[p.value])}>{p.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Relationship strength */}
          <Select
            value={form.relationship_strength}
            onValueChange={(v) => update("relationship_strength", v)}
          >
            <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
              <span>{selectedStrength?.label ?? "Relationship"}</span>
            </SelectTrigger>
            <SelectContent portal={false}>
              {RELATIONSHIP_STRENGTHS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Campaign */}
          <Select
            value={form.campaign_id || "none"}
            onValueChange={(v) => update("campaign_id", v === "none" ? "" : v)}
          >
            <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
              <span className={form.campaign_id ? "" : "text-muted-foreground"}>
                {selectedCampaign?.name || "No campaign"}
              </span>
            </SelectTrigger>
            <SelectContent portal={false}>
              <SelectItem value="none">No campaign</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Core properties */}
        <div className="border-t border-border/50 px-4 py-2.5 space-y-0.5">
          <PropertyRow label="Email">
            <InlineInput
              value={form.email}
              onChange={(v) => update("email", v)}
              placeholder="email@example.com"
              type="email"
            />
          </PropertyRow>
          <PropertyRow label="Phone">
            <InlineInput
              value={form.phone}
              onChange={(v) => update("phone", v)}
              placeholder="+1 555 000 0000"
            />
          </PropertyRow>
          <PropertyRow label="Company">
            <InlineInput
              value={form.company}
              onChange={(v) => update("company", v)}
              placeholder="Company name"
            />
          </PropertyRow>
          <PropertyRow label="Organization">
            {selectedOrg ? (
              <div className="flex items-center gap-1.5 h-7">
                <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs truncate">{selectedOrg.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedOrg(null)}
                  className="ml-auto text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : orgSearching ? (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={orgQuery}
                    onChange={(e) => setOrgQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setOrgSearching(false); }}
                    autoFocus
                    placeholder="Search organizations..."
                    className="w-full h-7 rounded-md border border-input bg-transparent pl-7 pr-7 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button type="button" onClick={() => setOrgSearching(false)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {orgResults.length > 0 && (
                  <div className="rounded-md border border-border/50 overflow-hidden max-h-[120px] overflow-y-auto">
                    {orgResults.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => { setSelectedOrg(org); setOrgSearching(false); setOrgQuery(""); }}
                        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs hover:bg-accent/50 transition-colors"
                      >
                        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{org.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOrgSearching(true)}
                className="h-7 text-xs text-muted-foreground/40 hover:text-muted-foreground px-1.5 -ml-1.5 rounded transition-colors hover:bg-accent/30"
              >
                Link organization...
              </button>
            )}
          </PropertyRow>
          <PropertyRow label="Title">
            <InlineInput
              value={form.title}
              onChange={(v) => update("title", v)}
              placeholder="Head of Product"
            />
          </PropertyRow>
          <PropertyRow label="Location">
            <InlineInput
              value={form.location}
              onChange={(v) => update("location", v)}
              placeholder="San Francisco, CA"
            />
          </PropertyRow>
          <PropertyRow label="LinkedIn">
            <InlineInput
              value={form.linkedin_url}
              onChange={(v) => update("linkedin_url", v)}
              placeholder="linkedin.com/in/..."
            />
          </PropertyRow>
          <PropertyRow label="Twitter/X">
            <InlineInput
              value={form.twitter_url}
              onChange={(v) => update("twitter_url", v)}
              placeholder="x.com/..."
            />
          </PropertyRow>
          <PropertyRow label="Website">
            <InlineInput
              value={form.website_url}
              onChange={(v) => update("website_url", v)}
              placeholder="https://..."
            />
          </PropertyRow>
          <PropertyRow label="Source">
            <InlineInput
              value={form.source}
              onChange={(v) => update("source", v)}
              placeholder="Referral, event, cold outreach..."
            />
          </PropertyRow>
          <PropertyRow label="Tags">
            <TagInput
              value={tags}
              onChange={setTags}
              placeholder="Add tag..."
              className="min-h-[28px]"
            />
          </PropertyRow>
        </div>

        {/* Dynamic fields from field_definitions */}
        {groupedFields.length > 0 && (
          <div className="border-t border-border/50 px-4 py-3">
            <DynamicFieldGroups
              groupedFields={groupedFields}
              values={extended}
              onChange={setExtended}
              inDialog
            />
          </div>
        )}

        {/* Notes & How we met */}
        <div className="border-t border-border/50 px-4 py-3 space-y-3">
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">How we met</span>
            <Textarea
              value={form.how_we_met}
              onChange={(e) => update("how_we_met", e.target.value)}
              placeholder="Intro at SaaStr, referral from..."
              rows={2}
              className="text-xs resize-none border-border/50 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Notes</span>
            <Textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Anything worth remembering..."
              rows={4}
              className="text-xs resize-none border-border/50 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

      </div>
    </SidePanel>
  );
}
