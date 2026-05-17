"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Contact,
  PRIORITIES,
  PRIORITY_COLORS,
  RELATIONSHIP_STRENGTHS,
} from "@/lib/crm/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import { DEFAULT_STAGE_COLOR } from "@/lib/fields/types";
import { PropertyList } from "@/components/shared/property-list";
import { PipelineStagePicker } from "@/components/shared/pipeline-stage-picker";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pencil,
  Trash2,
  Archive,
  ExternalLink,
  ArrowLeft,
  X,
  Check,
  Copy,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit/log";
import { DraftSetsSection } from "./draft-sets-section";
import { InteractionsTimeline } from "./interactions-timeline";
import { ContactOrganizationsSection } from "./contact-organizations-section";
import { ContactInboxHistory } from "@/components/inbox/contact-inbox-history";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

// ── Inline editable field components ────────────────────────────────

function InlineText({
  value,
  field,
  onSave,
  placeholder,
  className,
  inputClassName,
  multiline,
}: {
  value: string | null;
  field: string;
  onSave: (field: string, value: string | null) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  function startEditing() {
    setDraft(value || "");
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function commit() {
    const trimmed = draft.trim();
    const newVal = trimmed || null;
    if (newVal !== value) onSave(field, newVal);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    const Component = multiline ? "textarea" : "input";
    return (
      <Component
        ref={inputRef as React.RefObject<HTMLInputElement & HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        className={cn(
          "w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          multiline && "resize-none",
          inputClassName
        )}
      />
    );
  }

  return (
    <span
      onClick={startEditing}
      className={cn(
        "cursor-pointer rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted inline-block min-w-[2rem]",
        !value && "text-muted-foreground/50 italic",
        className
      )}
      title="Click to edit"
    >
      {value || placeholder || "—"}
    </span>
  );
}

function InlineTags({
  value,
  field,
  onSave,
}: {
  value: string[];
  field: string;
  onSave: (field: string, value: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag && !value.includes(tag)) {
      onSave(field, [...value, tag]);
    }
    setInputValue("");
  }

  function removeTag(tag: string) {
    onSave(field, value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue);
    }
    if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 min-h-[1.75rem] cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(tag);
            }}
            className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5 transition-colors"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </Badge>
      ))}
      <input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (inputValue.trim()) addTag(inputValue);
        }}
        placeholder={value.length === 0 ? "Add tags..." : ""}
        className="bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 placeholder:italic min-w-[4rem] flex-1"
      />
    </div>
  );
}

function InlineLink({
  value,
  field,
  onSave,
  placeholder,
}: {
  value: string | null;
  field: string;
  onSave: (field: string, value: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEditing() {
    setDraft(value || "");
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed !== (value || "")) onSave(field, trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 w-full">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 rounded-md border border-input bg-transparent px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            commit();
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Check className="size-3.5" />
        </button>
      </div>
    );
  }

  if (value) {
    return (
      <div className="group flex items-center gap-1.5 min-w-0">
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent-blue hover:text-accent-blue/80 hover:underline truncate min-w-0"
          title={value}
        >
          {value.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
        <button
          type="button"
          onClick={startEditing}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          title="Edit URL"
        >
          <Pencil className="size-3" />
        </button>
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-accent-blue"
          title="Open in new tab"
        >
          <ExternalLink className="size-3" />
        </a>
      </div>
    );
  }

  return (
    <span
      onClick={startEditing}
      className="cursor-pointer text-sm text-muted-foreground/50 italic rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted inline-block"
      title="Click to add URL"
    >
      {placeholder || "Add URL..."}
    </span>
  );
}

function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 py-1.5", className)}>
      <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5 select-none">
        {label}
      </span>
      <div className="flex-1 min-w-0 text-sm">{children}</div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function ContactDetailView({ contact: initialContact }: { contact: Contact }) {
  const router = useRouter();
  const [contact, setContact] = useState(initialContact);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { stages, getStageColor } = usePipelineStages("contact");
  const { fields, groupedFields, addField, updateField, deleteField, reorderFields } = useFieldDefinitions("contact");

  const supabase = useMemo(() => createClient(), []);

  const fetchCampaigns = useCallback(async () => {
    const { data } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    if (data) setCampaigns(data);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCampaigns();
  }, [fetchCampaigns]);

  // ── Save any field inline ───────────────────────────────────────

  async function saveField(field: string, value: unknown) {
    const updates: Record<string, unknown> = { [field]: value };
    if (field === "status") {
      updates.status_changed_at = new Date().toISOString();
    }
    const oldValue = (contact as unknown as Record<string, unknown>)[field];
    const { error } = await supabase.from("contacts").update(updates).eq("id", contact.id);
    if (error) {
      toast.error(`Failed to update ${field}`);
      return;
    }
    logAudit(supabase, {
      module: "crm",
      entity_type: "contact",
      entity_id: contact.id,
      action: field === "status" ? "status_changed" : "updated",
      summary: `Updated '${field}' on contact '${contact.name}'`,
      changes: { [field]: { old: oldValue, new: value } },
    });
    setContact((c) => ({ ...c, ...updates } as Contact));
  }

  async function saveExtended(next: Record<string, unknown>) {
    const { error } = await supabase
      .from("contacts")
      .update({ extended: next })
      .eq("id", contact.id);
    if (error) {
      toast.error("Failed to update custom fields");
      return;
    }
    logAudit(supabase, {
      module: "crm",
      entity_type: "contact",
      entity_id: contact.id,
      action: "updated",
      summary: `Updated custom fields on contact '${contact.name}'`,
    });
    setContact((c) => ({ ...c, extended: next }));
  }

  async function handleArchive() {
    await supabase
      .from("contacts")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", contact.id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "contact",
      entity_id: contact.id,
      action: "archived",
      summary: `Archived contact '${contact.name}'`,
    });
    toast("Contact archived");
    router.back();
  }

  async function handleDelete() {
    await supabase.from("contacts").delete().eq("id", contact.id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "contact",
      entity_id: contact.id,
      action: "deleted",
      summary: `Deleted contact '${contact.name}'`,
    });
    toast("Contact deleted");
    router.push("/dashboard/crm");
  }

  function copyContactAsMarkdown() {
    const lines: string[] = [`# ${contact.name}`];
    const add = (label: string, v: string | null | undefined) => {
      if (v) lines.push(`- **${label}**: ${v}`);
    };
    add("Title", contact.title);
    add("Company", contact.company);
    add("Email", contact.email);
    add("Phone", contact.phone);
    add("LinkedIn", contact.linkedin_url);
    add("Location", contact.location);
    add("Status", stages.find((s) => s.stage_key === contact.status)?.label ?? contact.status);
    if (contact.tags.length > 0) lines.push(`- **Tags**: ${contact.tags.join(", ")}`);
    if (contact.notes) lines.push(`\n## Notes\n${contact.notes}`);
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied to clipboard");
  }

  const currentStage = stages.find((s) => s.stage_key === contact.status);
  const currentPriority = PRIORITIES.find((p) => p.value === contact.priority);
  const currentStrength = RELATIONSHIP_STRENGTHS.find(
    (s) => s.value === contact.relationship_strength
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard/crm">CRM</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="truncate">{contact.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={copyContactAsMarkdown}
            title="Copy as markdown"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setConfirmArchive(true)}
            title="Archive"
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive/80"
            onClick={() => setConfirmDelete(true)}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_280px] max-w-6xl">
          {/* Left column — main content */}
          <div className="space-y-6 min-w-0">
            {/* Title block */}
            <div>
              <h1 className="text-xl font-semibold">
                <InlineText value={contact.name} field="name" onSave={saveField} />
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                <InlineText
                  value={contact.title}
                  field="title"
                  onSave={saveField}
                  placeholder="Title"
                />
                {" · "}
                <InlineText
                  value={contact.company}
                  field="company"
                  onSave={saveField}
                  placeholder="Company"
                />
              </p>
            </div>

            <Separator className="bg-border/50" />

            {/* Core info */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Info
              </h3>
              <DetailRow label="Email">
                <InlineText
                  value={contact.email}
                  field="email"
                  onSave={saveField}
                  placeholder="email@example.com"
                />
              </DetailRow>
              <DetailRow label="Phone">
                <InlineText
                  value={contact.phone}
                  field="phone"
                  onSave={saveField}
                  placeholder="+1 555 000 0000"
                />
              </DetailRow>
              <DetailRow label="Location">
                <InlineText
                  value={contact.location}
                  field="location"
                  onSave={saveField}
                  placeholder="City, Country"
                />
              </DetailRow>
              <DetailRow label="Source">
                <InlineText
                  value={contact.source}
                  field="source"
                  onSave={saveField}
                  placeholder="Referral, event..."
                />
              </DetailRow>
              <DetailRow label="LinkedIn">
                <InlineLink
                  value={contact.linkedin_url}
                  field="linkedin_url"
                  onSave={saveField}
                  placeholder="Add LinkedIn URL"
                />
              </DetailRow>
              <DetailRow label="Twitter/X">
                <InlineLink
                  value={contact.twitter_url}
                  field="twitter_url"
                  onSave={saveField}
                  placeholder="Add Twitter URL"
                />
              </DetailRow>
              <DetailRow label="Website">
                <InlineLink
                  value={contact.website_url}
                  field="website_url"
                  onSave={saveField}
                  placeholder="Add website"
                />
              </DetailRow>
              <DetailRow label="Tags">
                <InlineTags value={contact.tags ?? []} field="tags" onSave={saveField} />
              </DetailRow>
              <DetailRow label="How we met">
                <InlineText
                  value={contact.how_we_met}
                  field="how_we_met"
                  onSave={saveField}
                  placeholder="Intro via..."
                  multiline
                />
              </DetailRow>
            </div>

            {/* Organizations */}
            <Separator className="bg-border/50" />
            <ContactOrganizationsSection contactId={contact.id} />

            {/* Properties (custom fields) */}
            <Separator className="bg-border/50" />
            <PropertyList
              fields={fields}
              values={contact.extended ?? {}}
              onValueChange={(key, value) => {
                const next = { ...contact.extended, [key]: value };
                if (value === null || value === undefined || value === "") delete next[key];
                saveExtended(next);
              }}
              onAddField={addField}
              onUpdateField={updateField}
              onDeleteField={deleteField}
              onReorderFields={reorderFields}
              entityType="contact"
            />

            {/* Notes */}
            <Separator className="bg-border/50" />
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Notes
              </h3>
              <Textarea
                value={contact.notes ?? ""}
                onChange={(e) => setContact((c) => ({ ...c, notes: e.target.value }))}
                onBlur={() => saveField("notes", contact.notes || null)}
                placeholder="Anything worth remembering..."
                rows={5}
                className="text-sm resize-none border-border/50"
              />
            </div>

            {/* Interactions timeline */}
            <Separator className="bg-border/50" />
            <InteractionsTimeline contactId={contact.id} contactName={contact.name} />

            {/* Draft sets */}
            <Separator className="bg-border/50" />
            <DraftSetsSection contactId={contact.id} contactName={contact.name} />

            {/* Automation history */}
            <Separator className="bg-border/50" />
            <ContactInboxHistory contactId={contact.id} />
          </div>

          {/* Right sidebar — status & properties */}
          <aside className="space-y-4 lg:sticky lg:top-4 self-start">
            <div className="rounded-md border border-border/50 p-3 space-y-3">
              {/* Status */}
              <div>
                <Label>Status</Label>
                <PipelineStagePicker
                  entityType="contact"
                  value={contact.status}
                  onValueChange={(v) => saveField("status", v)}
                  triggerClassName="w-full justify-between"
                />
                {currentStage && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    <span
                      className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ backgroundColor: getStageColor(contact.status) ?? DEFAULT_STAGE_COLOR }}
                    />
                    {currentStage.label}
                  </p>
                )}
              </div>

              {/* Priority */}
              <div>
                <Label>Priority</Label>
                <Select
                  value={contact.priority ?? ""}
                  onValueChange={(v) => saveField("priority", v || null)}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue placeholder="Set priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <span className={cn("capitalize", PRIORITY_COLORS[p.value])}>
                          {p.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {currentPriority && (
                  <p className={cn("text-[10px] mt-1", PRIORITY_COLORS[currentPriority.value])}>
                    {currentPriority.label}
                  </p>
                )}
              </div>

              {/* Relationship */}
              <div>
                <Label>Relationship</Label>
                <Select
                  value={contact.relationship_strength}
                  onValueChange={(v) => saveField("relationship_strength", v)}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_STRENGTHS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {currentStrength && (
                  <p className="text-[10px] text-muted-foreground mt-1">{currentStrength.label}</p>
                )}
              </div>

              {/* Campaign */}
              <div>
                <Label>Campaign</Label>
                <Select
                  value={contact.campaign_id ?? "none"}
                  onValueChange={(v) => saveField("campaign_id", v === "none" ? null : v)}
                >
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No campaign</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Metadata */}
            <div className="rounded-md border border-border/50 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Created</span>
                <span className="tabular-nums">
                  {format(new Date(contact.created_at), "MMM d, yyyy")}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Updated</span>
                <span className="tabular-nums">
                  {format(new Date(contact.updated_at), "MMM d, yyyy")}
                </span>
              </div>
              {contact.last_contact_date && (
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Last contact</span>
                  <span className="tabular-nums">
                    {format(new Date(contact.last_contact_date), "MMM d, yyyy")}
                  </span>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        title={`Archive ${contact.name}?`}
        description="Archived contacts are hidden from the main list but can be restored later. Campaign activity stays intact."
        confirmLabel="Archive"
        tone="warning"
        onConfirm={async () => {
          await handleArchive();
          setConfirmArchive(false);
        }}
        onCancel={() => setConfirmArchive(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${contact.name}?`}
        description="This permanently removes the contact, draft sets, and interaction history. This action cannot be undone."
        confirmLabel="Delete contact"
        onConfirm={async () => {
          await handleDelete();
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
      {children}
    </span>
  );
}
