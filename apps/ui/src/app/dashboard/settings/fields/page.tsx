"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FieldDefinition,
  FieldType,
  FIELD_TYPES,
} from "@/lib/fields/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { TagInput } from "@/components/ui/tag-input";
import { Plus, Trash2, LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { logAudit } from "@/lib/audit/log";
import { toast } from "sonner";

const ENTITY_TYPES = [
  { value: "contact", label: "Contacts" },
  { value: "organization", label: "Organizations" },
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .slice(0, 40);
}

function FieldEditor({ entityType }: { entityType: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [newGroup, setNewGroup] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchFields = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("field_definitions")
      .select("*")
      .eq("entity_type", entityType)
      .order("sort_order", { ascending: true });
    if (data) setFields(data as FieldDefinition[]);
    setLoading(false);
  }, [supabase, entityType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFields();
  }, [fetchFields]);

  async function updateField(id: string, patch: Partial<FieldDefinition>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    const { error } = await supabase
      .from("field_definitions")
      .update(patch)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update field");
      fetchFields();
      return;
    }
    logAudit(supabase, {
      module: "settings",
      entity_type: "field_definition",
      entity_id: id,
      action: "updated",
      summary: `Updated field definition`,
    });
  }

  async function deleteField(id: string) {
    await supabase.from("field_definitions").delete().eq("id", id);
    logAudit(supabase, {
      module: "settings",
      entity_type: "field_definition",
      entity_id: id,
      action: "deleted",
      summary: `Deleted field definition`,
    });
    fetchFields();
  }

  async function createField() {
    if (!newLabel.trim()) return;
    const field_key = slugify(newLabel);
    if (!field_key) {
      toast.error("Invalid label");
      return;
    }
    const nextOrder = fields.length > 0 ? Math.max(...fields.map((f) => f.sort_order)) + 10 : 10;
    const { data, error } = await supabase
      .from("field_definitions")
      .insert({
        entity_type: entityType,
        field_key,
        field_type: newType,
        label: newLabel.trim(),
        field_group: newGroup.trim() || null,
        sort_order: nextOrder,
        required: false,
        options: newType === "select" || newType === "multiselect" ? [] : null,
        is_active: true,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message ?? "Failed to create field");
      return;
    }
    if (data) {
      logAudit(supabase, {
        module: "settings",
        entity_type: "field_definition",
        entity_id: data.id,
        action: "created",
        summary: `Created field '${newLabel}'`,
      });
    }
    setNewLabel("");
    setNewType("text");
    setNewGroup("");
    setAdding(false);
    fetchFields();
  }

  // Group for display
  const grouped = useMemo(() => {
    const map = new Map<string, FieldDefinition[]>();
    for (const f of fields) {
      const group = f.field_group ?? "Other";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(f);
    }
    return Array.from(map.entries());
  }, [fields]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground italic">
          No custom fields yet. Add your first field below.
        </p>
      )}

      {grouped.map(([group, groupFields]) => (
        <div key={group} className="space-y-1.5">
          <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {group}
          </h3>
          <div className="space-y-1">
            {groupFields.map((field) => (
              <div
                key={field.id}
                className="group rounded-md border border-border/50 p-2 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(field.id, { label: e.target.value })}
                    className="h-7 text-xs flex-1"
                  />
                  <span className="text-[10px] text-muted-foreground font-mono w-24 truncate">
                    {field.field_key}
                  </span>
                  <Select
                    value={field.field_type}
                    onValueChange={(v) =>
                      updateField(field.id, { field_type: v as FieldType })
                    }
                  >
                    <SelectTrigger className="h-7 w-[110px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                    <Switch
                      checked={field.required}
                      onCheckedChange={(v) => updateField(field.id, { required: v })}
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                    <Switch
                      checked={field.is_active}
                      onCheckedChange={(v) => updateField(field.id, { is_active: v })}
                    />
                    Active
                  </label>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => setConfirmDeleteId(field.id)}
                    aria-label="Delete field"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                <div className="flex items-center gap-2 pl-1">
                  <Input
                    value={field.field_group ?? ""}
                    onChange={(e) =>
                      updateField(field.id, {
                        field_group: e.target.value || null,
                      })
                    }
                    placeholder="Group (e.g. Audience, Profile)"
                    className="h-6 text-[11px] w-48"
                  />
                  <Input
                    value={field.description ?? ""}
                    onChange={(e) =>
                      updateField(field.id, { description: e.target.value || null })
                    }
                    placeholder="Help text (optional)"
                    className="h-6 text-[11px] flex-1"
                  />
                </div>

                {(field.field_type === "select" || field.field_type === "multiselect") && (
                  <div className="pl-1">
                    <TagInput
                      value={field.options ?? []}
                      onChange={(v) => updateField(field.id, { options: v })}
                      placeholder="Add option..."
                      className="min-h-[24px]"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {adding ? (
        <div className="rounded-md border border-border/50 p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createField();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewLabel("");
                }
              }}
              placeholder="Field label"
              autoFocus
              className="h-7 text-xs flex-1"
            />
            <Select value={newType} onValueChange={(v) => setNewType(v as FieldType)}>
              <SelectTrigger className="h-7 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="Group"
              className="h-7 text-xs w-32"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setAdding(false);
                setNewLabel("");
              }}
            >
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={createField}>
              Add
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add field
        </Button>
      )}

      <ConfirmDeleteDialog
        open={!!confirmDeleteId}
        onConfirm={() => {
          if (confirmDeleteId) deleteField(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
        title="Delete custom field?"
        description="Existing data on records will remain in the database but stop showing on forms and detail views."
      />
    </div>
  );
}

export default function FieldsSettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<LayoutGrid className="h-4 w-4" />}
        title="Custom fields"
        description="Define fields that appear on records in addition to the core schema."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-4xl p-5">
          <Tabs defaultValue="contact">
            <TabsList variant="line" className="h-10">
              {ENTITY_TYPES.map((e) => (
                <TabsTrigger key={e.value} value={e.value} className="text-[13px]">
                  {e.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {ENTITY_TYPES.map((e) => (
              <TabsContent key={e.value} value={e.value} className="pt-5">
                <FieldEditor entityType={e.value} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
