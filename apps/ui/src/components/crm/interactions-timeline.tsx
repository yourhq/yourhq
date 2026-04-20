"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit/log";
import {
  Interaction,
  INTERACTION_TYPES,
} from "@/lib/interactions/types";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Phone,
  Users,
  MessageSquare,
  Coffee,
  PartyPopper,
  StickyNote,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { InteractionForm } from "./interaction-form";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  call: Phone,
  meeting: Users,
  linkedin_message: MessageSquare,
  dm: MessageSquare,
  intro: Users,
  coffee: Coffee,
  event: PartyPopper,
  note: StickyNote,
  other: MoreHorizontal,
};

function typeLabel(type: string): string {
  return INTERACTION_TYPES.find((t) => t.value === type)?.label ?? type;
}

interface InteractionsTimelineProps {
  contactId: string;
  contactName: string;
}

export function InteractionsTimeline({ contactId, contactName }: InteractionsTimelineProps) {
  const supabase = useMemo(() => createClient(), []);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Interaction | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchInteractions = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("interactions")
      .select("*")
      .eq("contact_id", contactId)
      .order("occurred_at", { ascending: false });
    if (data) setInteractions(data as Interaction[]);
    setLoading(false);
  }, [supabase, contactId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInteractions();
  }, [fetchInteractions]);

  async function handleDelete(id: string) {
    const { error } = await supabase.from("interactions").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    logAudit(supabase, {
      module: "crm",
      entity_type: "interaction",
      entity_id: id,
      action: "deleted",
      summary: `Deleted interaction with ${contactName}`,
    });
    toast.success("Interaction deleted");
    fetchInteractions();
  }

  function handleEdit(interaction: Interaction) {
    setEditing(interaction);
    setFormOpen(true);
  }

  function handleClose() {
    setFormOpen(false);
    setEditing(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Interactions {interactions.length > 0 && `(${interactions.length})`}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => setFormOpen(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Log interaction
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : interactions.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No interactions yet. Log your first touchpoint.
        </p>
      ) : (
        <ol className="relative space-y-3 border-l border-border/50 pl-4">
          {interactions.map((i) => {
            const Icon = TYPE_ICONS[i.type] ?? MoreHorizontal;
            return (
              <li key={i.id} className="relative group">
                {/* Dot */}
                <span className="absolute -left-[21px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-background ring-1 ring-border">
                  <Icon className="h-2 w-2 text-muted-foreground" />
                </span>

                <div className="rounded-md border border-border/50 bg-card/40 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium capitalize">{typeLabel(i.type)}</span>
                    {i.direction === "outbound" && (
                      <ArrowUpRight className="h-3 w-3 text-blue-400" />
                    )}
                    {i.direction === "inbound" && (
                      <ArrowDownLeft className="h-3 w-3 text-green-400" />
                    )}
                    {i.channel && (
                      <span className="text-[10px] text-muted-foreground">· {i.channel}</span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                      {format(new Date(i.occurred_at), "MMM d, yyyy")}
                    </span>
                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleEdit(i)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setDeleteId(i.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {i.subject && <div className="text-sm font-medium">{i.subject}</div>}
                  {i.summary && (
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {i.summary}
                    </div>
                  )}
                  {i.next_action_date && (
                    <div
                      className={cn(
                        "flex items-center gap-1.5 pt-1 text-[11px]",
                        new Date(i.next_action_date) <= new Date()
                          ? "text-red-400"
                          : "text-muted-foreground"
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      Follow up {formatDistanceToNow(new Date(i.next_action_date), { addSuffix: true })}
                      {i.next_action && `: ${i.next_action}`}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <InteractionForm
        open={formOpen}
        onClose={handleClose}
        contactId={contactId}
        contactName={contactName}
        interaction={editing}
        onSaved={fetchInteractions}
      />

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete interaction?"
        description="This removes the interaction from the contact's timeline. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteId) await handleDelete(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
