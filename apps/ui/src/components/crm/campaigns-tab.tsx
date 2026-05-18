"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Campaign } from "@/lib/crm/types";
import { Input } from "@/components/ui/input";
import { logAudit } from "@/lib/audit/log";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export function CampaignsTab() {
  const mobile = useIsMobile();
  const [campaigns, setCampaigns] = useState<(Campaign & { contact_count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("campaigns")
      .select("*, contacts(count)")
      .order("created_at", { ascending: false });

    if (data) {
      const mapped = data.map((c: Record<string, unknown>) => ({
        ...c,
        contact_count: (c.contacts as { count: number }[])?.[0]?.count || 0,
      }));
      setCampaigns(mapped as (Campaign & { contact_count: number })[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCampaigns();
  }, [fetchCampaigns]);

  async function handleToggleActive(campaign: Campaign) {
    const newActive = !campaign.is_active;
    await supabase
      .from("campaigns")
      .update({ is_active: newActive })
      .eq("id", campaign.id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "campaign",
      entity_id: campaign.id,
      action: newActive ? "restored" : "archived",
      summary: `${newActive ? "Restored" : "Archived"} campaign '${campaign.name}'`,
    });
    fetchCampaigns();
    toast.success(campaign.is_active ? "Campaign archived" : "Campaign restored");
  }

  return (
    <div className="flex h-full flex-col overflow-auto p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
        </span>
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          <Plus className="mr-1 h-3 w-3" />
          New Campaign
        </Button>
      </div>

      {loading ? (
        <p className="text-center text-xs text-muted-foreground py-8">Loading...</p>
      ) : campaigns.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-8">
          No campaigns yet. Create one to organize your outreach.
        </p>
      ) : mobile ? (
        <div className="space-y-2">
          {campaigns.map((campaign) => (
            <button
              key={campaign.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border border-border/50 p-3 text-left transition-colors active:bg-accent/50"
              onClick={() => { setEditing(campaign); setShowForm(true); }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{campaign.name}</span>
                  <StatusDot
                    color={campaign.is_active ? "var(--status-success)" : "var(--status-neutral)"}
                    label={campaign.is_active ? "Active" : "Archived"}
                  />
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                  {campaign.channel && <span>{campaign.channel}</span>}
                  <span>{campaign.contact_count} contacts</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => { e.stopPropagation(); handleToggleActive(campaign); }}
              >
                {campaign.is_active ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
              </Button>
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/50 hover:bg-transparent">
                <TableHead className="h-7 py-0 text-xs">Name</TableHead>
                <TableHead className="h-7 py-0 text-xs hidden sm:table-cell">Channel</TableHead>
                <TableHead className="h-7 py-0 text-xs hidden md:table-cell">Description</TableHead>
                <TableHead className="h-7 py-0 text-xs text-right">Contacts</TableHead>
                <TableHead className="h-7 py-0 text-xs">Status</TableHead>
                <TableHead className="h-7 py-0 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id} className="border-b border-border/50 hover:bg-accent/40 group">
                  <TableCell className="py-1.5 px-3 text-sm font-medium">{campaign.name}</TableCell>
                  <TableCell className="py-1.5 px-3 hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {campaign.channel || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 px-3 hidden md:table-cell max-w-[250px] truncate">
                    <span className="text-xs text-muted-foreground">{campaign.description || "—"}</span>
                  </TableCell>
                  <TableCell className="py-1.5 px-3 text-right">
                    <span className="text-xs text-muted-foreground tabular-nums">{campaign.contact_count}</span>
                  </TableCell>
                  <TableCell className="py-1.5 px-3">
                    <StatusDot
                      color={campaign.is_active ? "var(--status-success)" : "var(--status-neutral)"}
                      label={campaign.is_active ? "Active" : "Archived"}
                    />
                  </TableCell>
                  <TableCell className="py-1.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setEditing(campaign);
                          setShowForm(true);
                        }}
                        title="Edit"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleToggleActive(campaign)}
                        title={campaign.is_active ? "Archive" : "Restore"}
                      >
                        {campaign.is_active ? (
                          <Archive className="h-3 w-3" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CampaignForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        campaign={editing}
        onSaved={() => {
          setShowForm(false);
          setEditing(null);
          fetchCampaigns();
        }}
      />
    </div>
  );
}

function CampaignForm({
  open,
  onClose,
  campaign,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  campaign: Campaign | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (campaign) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(campaign.name);
      setDescription(campaign.description || "");
      setChannel(campaign.channel || "");
      setShowDescription(!!campaign.description);
    } else {
      setName("");
      setDescription("");
      setChannel("");
      setShowDescription(false);
    }
  }, [campaign, open]);

  async function handleSubmit() {
    if (!name.trim()) return;

    setSaving(true);
    const data = {
      name: name.trim(),
      description: description.trim() || null,
      channel: channel || null,
    };

    if (campaign) {
      await supabase.from("campaigns").update(data).eq("id", campaign.id);
      logAudit(supabase, {
        module: "crm",
        entity_type: "campaign",
        entity_id: campaign.id,
        action: "updated",
        summary: `Updated campaign '${data.name}'`,
      });
      toast.success("Campaign updated");
    } else {
      const { data: inserted } = await supabase.from("campaigns").insert(data).select("id").single();
      if (inserted) {
        logAudit(supabase, {
          module: "crm",
          entity_type: "campaign",
          entity_id: inserted.id,
          action: "created",
          summary: `Created campaign '${data.name}'`,
        });
      }
      toast.success("Campaign created");
    }

    setSaving(false);
    onSaved();
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (name.trim()) handleSubmit();
    }
  }

  if (!open) return null;

  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-md p-0 gap-0 overflow-hidden max-h-[85dvh] flex flex-col">
        <ResponsiveDialogTitle className="sr-only">
          {campaign ? "Edit campaign" : "New campaign"}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="sr-only">
          Group contacts under an outreach campaign.
        </ResponsiveDialogDescription>
        <div className="flex-1 overflow-y-auto min-h-0">
        {/* Name - hero input */}
        <div className="px-4 pt-4 pb-2">
          <textarea
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            placeholder={campaign ? "Campaign name" : "Name this campaign..."}
            autoFocus
            rows={1}
            className="w-full resize-none overflow-hidden border-0 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {/* Description - expandable */}
          {showDescription ? (
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Campaign notes..."
              rows={2}
              className="mt-1 border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none resize-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="mt-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Add description...
            </button>
          )}
        </div>

        {/* Property bar - channel token (free text) */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-4 py-2.5">
          <Input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="Channel (e.g. email, linkedin)"
            className="h-6 w-auto min-w-[180px] border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent focus-visible:ring-0"
          />
        </div>

        </div>{/* end scrollable area */}

        {/* Submit bar */}
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 shrink-0">
          <p className="text-[11px] text-muted-foreground/50">
            Press Enter to {campaign ? "save" : "create"}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={saving || !name.trim()}>
              {saving ? "Saving..." : campaign ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
