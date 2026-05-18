"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Organization,
  ORG_TYPES,
  ORG_SIZES,
} from "@/lib/organizations/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import { PropertyList } from "@/components/shared/property-list";
import { PipelineStagePicker } from "@/components/shared/pipeline-stage-picker";
import { logAudit } from "@/lib/audit/log";
import { SidePanel } from "@/components/shared/side-panel";
import { TagInput } from "@/components/ui/tag-input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";

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

export function OrgForm({
  open,
  onClose,
  organization,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  organization: Organization | null;
  onSaved: () => void;
}) {
  const { defaultStage } = usePipelineStages("organization");
  const { fields, groupedFields, addField, updateField, deleteField, reorderFields } = useFieldDefinitions("organization");

  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [extended, setExtended] = useState<Record<string, unknown>>({});
  const nameRef = useRef<HTMLTextAreaElement>(null);

  const [form, setForm] = useState({
    name: "",
    type: "",
    website: "",
    industry: "",
    size: "",
    location: "",
    description: "",
    notes: "",
    status: "",
  });

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (organization) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        name: organization.name,
        type: organization.type ?? "",
        website: organization.website ?? "",
        industry: organization.industry ?? "",
        size: organization.size ?? "",
        location: organization.location ?? "",
        description: organization.description ?? "",
        notes: organization.notes ?? "",
        status: organization.status ?? "",
      });
      setTags(organization.tags ?? []);
      setExtended(organization.extended ?? {});
    } else {
      setForm({
        name: "",
        type: "",
        website: "",
        industry: "",
        size: "",
        location: "",
        description: "",
        notes: "",
        status: defaultStage?.stage_key ?? "",
      });
      setTags([]);
      setExtended({});
    }
  }, [organization, open, defaultStage]);

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

    const requiredFields = groupedFields
      .flatMap((g) => g.fields)
      .filter((f) => f.required);
    const missing = requiredFields.filter((f) => {
      const val = extended[f.field_key];
      return val === undefined || val === null || val === "";
    });
    if (missing.length > 0) {
      toast.error(`Required: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }

    setSaving(true);

    const data = {
      name: form.name.trim(),
      type: form.type || null,
      website: form.website.trim() || null,
      industry: form.industry.trim() || null,
      size: form.size || null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status || null,
      tags,
      extended,
    };

    if (organization) {
      const { error } = await supabase
        .from("organizations")
        .update(data)
        .eq("id", organization.id);
      if (error) {
        toast.error("Failed to update organization");
      } else {
        logAudit(supabase, {
          module: "crm",
          entity_type: "organization",
          entity_id: organization.id,
          action: "updated",
          summary: `Updated organization '${data.name}'`,
        });
        toast.success("Organization updated");
      }
    } else {
      const { data: inserted, error } = await supabase
        .from("organizations")
        .insert(data)
        .select("id")
        .single();
      if (error) {
        toast.error("Failed to create organization");
      } else {
        logAudit(supabase, {
          module: "crm",
          entity_type: "organization",
          entity_id: inserted.id,
          action: "created",
          summary: `Created organization '${data.name}'`,
        });
        toast.success("Organization created");
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

  const selectedType = ORG_TYPES.find((t) => t.value === form.type);
  const selectedSize = ORG_SIZES.find((s) => s.value === form.size);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title=""
      className="sm:max-w-lg lg:max-w-xl"
      footer={
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground/50">
            Press Enter to {organization ? "save" : "create"}
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
              {saving ? "Saving..." : organization ? "Save" : "Create"}
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
            placeholder={organization ? "Organization name" : "What's the organization name?"}
            autoFocus
            rows={1}
            className="w-full resize-none overflow-hidden border-0 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {(form.industry || form.location) && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {form.industry}
              {form.industry && form.location && " · "}
              {form.location}
            </p>
          )}
        </div>

        {/* Primary property bar */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-4 py-2.5">
          {/* Status */}
          <PipelineStagePicker
            entityType="organization"
            value={form.status || null}
            onValueChange={(v) => update("status", v ?? "")}
            allowNone
            compact
          />

          {/* Type */}
          <Select value={form.type || "none"} onValueChange={(v) => update("type", v === "none" ? "" : v)}>
            <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
              <span className={form.type ? "" : "text-muted-foreground"}>
                {selectedType?.label ?? "Type"}
              </span>
            </SelectTrigger>
            <SelectContent portal={false}>
              <SelectItem value="none">No type</SelectItem>
              {ORG_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Size */}
          <Select value={form.size || "none"} onValueChange={(v) => update("size", v === "none" ? "" : v)}>
            <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
              <span className={form.size ? "" : "text-muted-foreground"}>
                {selectedSize?.label ?? "Size"}
              </span>
            </SelectTrigger>
            <SelectContent portal={false}>
              <SelectItem value="none">Any size</SelectItem>
              {ORG_SIZES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Core properties */}
        <div className="border-t border-border/50 px-4 py-2.5 space-y-0.5">
          <PropertyRow label="Website">
            <InlineInput
              value={form.website}
              onChange={(v) => update("website", v)}
              placeholder="https://..."
              type="url"
            />
          </PropertyRow>
          <PropertyRow label="Industry">
            <InlineInput
              value={form.industry}
              onChange={(v) => update("industry", v)}
              placeholder="e.g. Fintech"
            />
          </PropertyRow>
          <PropertyRow label="Location">
            <InlineInput
              value={form.location}
              onChange={(v) => update("location", v)}
              placeholder="San Francisco, CA"
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

        {/* Dynamic fields */}
        <div className="border-t border-border/50 px-4 py-3">
          <PropertyList
            fields={fields}
            values={extended}
            onValueChange={(key, value) => {
              setExtended((prev) => {
                const next = { ...prev };
                if (value === null || value === undefined || value === "") delete next[key];
                else next[key] = value;
                return next;
              });
            }}
            onAddField={addField}
            onUpdateField={updateField}
            onDeleteField={deleteField}
            onReorderFields={reorderFields}
            entityType="organization"
          />
        </div>

        {/* Description & Notes */}
        <div className="border-t border-border/50 px-4 py-3 space-y-3">
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Description</span>
            <Textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="What does this organization do?"
              rows={3}
              className="text-xs resize-none border-border/50 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Notes</span>
            <Textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Internal notes..."
              rows={4}
              className="text-xs resize-none border-border/50 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
        </div>

      </div>
    </SidePanel>
  );
}
