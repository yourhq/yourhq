"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Organization,
  ContactOrganization,
  ORG_TYPES,
  ORG_SIZES,
} from "@/lib/organizations/types";
import { Contact } from "@/lib/crm/types";
import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import { DynamicFieldGroups } from "@/components/shared/dynamic-field-group";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Archive,
  Pencil,
  Trash2,
  Globe,
  MapPin,
  Briefcase,
  Users,
  Building2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { logAudit } from "@/lib/audit/log";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InteractionsTimeline } from "@/components/crm/interactions-timeline";
import { PipelineStagePicker } from "@/components/shared/pipeline-stage-picker";
import { OrgForm } from "./org-form";

interface OrgDetailProps {
  organization: Organization;
}

export function OrgDetail({ organization: initial }: OrgDetailProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [organization, setOrganization] = useState<Organization>(initial);
  const [people, setPeople] = useState<(ContactOrganization & { contact: Contact })[]>([]);
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { groupedFields } = useFieldDefinitions("organization");

  const fetchPeople = useCallback(async () => {
    const { data } = await supabase
      .from("contact_organizations")
      .select("*, contact:contacts(*)")
      .eq("org_id", organization.id)
      .order("is_current", { ascending: false });
    if (data) {
      setPeople(data as (ContactOrganization & { contact: Contact })[]);
    }
  }, [supabase, organization.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPeople();
  }, [fetchPeople]);

  async function handleStatusChange(newStatus: string) {
    const status = newStatus === "none" ? null : newStatus;
    const prev = organization.status;
    setOrganization({ ...organization, status });
    const { error } = await supabase
      .from("organizations")
      .update({ status })
      .eq("id", organization.id);
    if (error) {
      setOrganization({ ...organization, status: prev });
      toast.error("Failed to update status");
      return;
    }
    logAudit(supabase, {
      module: "crm",
      entity_type: "organization",
      entity_id: organization.id,
      action: "updated",
      summary: `Changed status on '${organization.name}'`,
    });
  }

  async function handleArchive() {
    await supabase
      .from("organizations")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", organization.id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "organization",
      entity_id: organization.id,
      action: "archived",
      summary: `Archived organization '${organization.name}'`,
    });
    toast.success("Organization archived");
    router.push("/dashboard/organizations");
  }

  async function handleDelete() {
    await supabase.from("organizations").delete().eq("id", organization.id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "organization",
      entity_id: organization.id,
      action: "deleted",
      summary: `Deleted organization '${organization.name}'`,
    });
    toast("Organization deleted");
    router.push("/dashboard/organizations");
  }

  async function onFormSaved() {
    setEditing(false);
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organization.id)
      .single();
    if (data) setOrganization(data as Organization);
  }

  const typeLabel = organization.type
    ? ORG_TYPES.find((t) => t.value === organization.type)?.label ?? organization.type
    : null;
  const sizeLabel = organization.size
    ? ORG_SIZES.find((s) => s.value === organization.size)?.label ?? organization.size
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => router.push("/dashboard/organizations")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{organization.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setEditing(true)}
          >
            <Pencil className="mr-1 h-3 w-3" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setConfirmArchive(true)}
          >
            <Archive className="mr-1 h-3 w-3" />
            Archive
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive/80"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Delete
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          <Tabs defaultValue="overview">
            <TabsList variant="line">
              <TabsTrigger value="overview" className="text-xs">
                Overview
              </TabsTrigger>
              <TabsTrigger value="people" className="text-xs">
                People {people.length > 0 && `(${people.length})`}
              </TabsTrigger>
              <TabsTrigger value="interactions" className="text-xs">
                Interactions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="pt-6 space-y-6">
              {/* Description */}
              {organization.description && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Description
                  </h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {organization.description}
                  </p>
                </div>
              )}

              {/* Core details */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {typeLabel && (
                    <DetailItem icon={Briefcase} label="Type" value={typeLabel} />
                  )}
                  {organization.industry && (
                    <DetailItem
                      icon={Building2}
                      label="Industry"
                      value={organization.industry}
                    />
                  )}
                  {sizeLabel && (
                    <DetailItem icon={Users} label="Size" value={sizeLabel} />
                  )}
                  {organization.location && (
                    <DetailItem
                      icon={MapPin}
                      label="Location"
                      value={organization.location}
                    />
                  )}
                  {organization.website && (
                    <DetailItem
                      icon={Globe}
                      label="Website"
                      value={
                        <a
                          href={organization.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground hover:underline"
                        >
                          {organization.website.replace(/^https?:\/\//, "")}
                        </a>
                      }
                    />
                  )}
                </div>
              </div>

              {/* Properties (custom fields) */}
              {groupedFields.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Properties
                  </h3>
                  <DynamicFieldGroups
                    groupedFields={groupedFields}
                    values={organization.extended ?? {}}
                    onChange={() => {
                      /* readonly here — editing happens via form */
                    }}
                    openByDefault={groupedFields.map((g) => g.group)}
                  />
                </div>
              ) : (
                <div className="py-1">
                  <Link
                    href="/dashboard/settings/fields"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    + Add custom properties in Settings
                  </Link>
                </div>
              )}

              {/* Notes */}
              {organization.notes && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Notes
                  </h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {organization.notes}
                  </p>
                </div>
              )}

              {/* Tags */}
              {organization.tags.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {organization.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="people" className="pt-6">
              {people.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No people linked to this organization yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {people.map((link) => (
                    <Link
                      key={link.id}
                      href={`/dashboard/contacts/${link.contact.id}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2 hover:bg-accent/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {link.contact.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {link.role || link.contact.title || link.contact.email || "—"}
                        </div>
                      </div>
                      {!link.is_current && (
                        <span className="text-[10px] text-muted-foreground">Former</span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="interactions" className="pt-6">
              <InteractionsTimeline
                orgId={organization.id}
                contactName={organization.name}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <aside className="w-[260px] shrink-0 border-l border-border/50 p-4 space-y-4 overflow-auto">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Status
            </label>
            <PipelineStagePicker
              entityType="organization"
              value={organization.status}
              onValueChange={(v) => handleStatusChange(v ?? "none")}
              allowNone
              triggerClassName="w-full justify-between"
            />
          </div>

          <div className="space-y-1 pt-4 border-t border-border/50">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Created</span>
              <span>
                {formatDistanceToNow(new Date(organization.created_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Updated</span>
              <span>
                {formatDistanceToNow(new Date(organization.updated_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        </aside>
      </div>

      <OrgForm
        open={editing}
        onClose={() => setEditing(false)}
        organization={organization}
        onSaved={onFormSaved}
      />

      <ConfirmDialog
        open={confirmArchive}
        title={`Archive ${organization.name}?`}
        description="Archived organizations are hidden from the main list but can be restored later. Contact associations stay intact."
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
        title={`Delete ${organization.name}?`}
        description="This permanently removes the organization and all contact associations. This action cannot be undone."
        confirmLabel="Delete organization"
        onConfirm={async () => {
          await handleDelete();
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground shrink-0">{label}:</span>
      <span className="text-sm truncate">{value}</span>
    </div>
  );
}

