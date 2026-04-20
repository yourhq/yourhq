"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit/log";
import type { Template } from "@/lib/crm/types";
import {
  Interaction,
  INTERACTION_TYPES,
  INTERACTION_DIRECTIONS,
} from "@/lib/interactions/types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DatePickerButton } from "@/components/ui/date-picker-button";
import { toast } from "sonner";
import { FileText } from "lucide-react";

interface InteractionFormProps {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  interaction?: Interaction | null;
  onSaved: () => void;
}

export function InteractionForm({
  open,
  onClose,
  contactId,
  contactName,
  interaction,
  onSaved,
}: InteractionFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase
      .from("templates")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (data) setTemplates(data as Template[]);
  }, [supabase]);

  const [type, setType] = useState<string>("email");
  const [direction, setDirection] = useState<string>("outbound");
  const [channel, setChannel] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState<string>(new Date().toISOString());
  const [nextAction, setNextAction] = useState("");
  const [nextActionDate, setNextActionDate] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchTemplates();
    if (interaction) {
      setType(interaction.type);
      setDirection(interaction.direction ?? "outbound");
      setChannel(interaction.channel ?? "");
      setSubject(interaction.subject ?? "");
      setBody(interaction.body ?? "");
      setOccurredAt(interaction.occurred_at);
      setNextAction(interaction.next_action ?? "");
      setNextActionDate(interaction.next_action_date);
    } else {
      setType("email");
      setDirection("outbound");
      setChannel("");
      setSubject("");
      setBody("");
      setOccurredAt(new Date().toISOString());
      setNextAction("");
      setNextActionDate(null);
    }
  }, [interaction, open, fetchTemplates]);

  function handleApplyTemplate(templateId: string) {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    if (tpl.subject) setSubject(tpl.subject);
    if (tpl.channel) setChannel(tpl.channel);
    setBody(tpl.body);
    toast.success(`Applied template "${tpl.name}"`);
  }

  async function handleSubmit() {
    if (!type) return;
    setSaving(true);

    const payload = {
      contact_id: contactId,
      type,
      direction: direction || null,
      channel: channel.trim() || null,
      subject: subject.trim() || null,
      summary: null,
      body: body.trim() || null,
      occurred_at: occurredAt,
      next_action: nextAction.trim() || null,
      next_action_date: nextActionDate,
    };

    if (interaction) {
      const { error } = await supabase
        .from("interactions")
        .update(payload)
        .eq("id", interaction.id);
      if (error) {
        toast.error("Failed to update interaction");
      } else {
        logAudit(supabase, {
          module: "crm",
          entity_type: "interaction",
          entity_id: interaction.id,
          action: "updated",
          summary: `Updated ${type} interaction with ${contactName}`,
        });
        toast.success("Interaction updated");
      }
    } else {
      const { data: inserted, error } = await supabase
        .from("interactions")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        toast.error("Failed to log interaction");
      } else {
        // Update contact's last_contact_date
        await supabase
          .from("contacts")
          .update({ last_contact_date: occurredAt })
          .eq("id", contactId);
        logAudit(supabase, {
          module: "crm",
          entity_type: "interaction",
          entity_id: inserted.id,
          action: "created",
          summary: `Logged ${type} interaction with ${contactName}`,
        });
        toast.success("Interaction logged");
      }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>
            {interaction ? "Edit interaction" : `Log interaction with ${contactName}`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portal={false}>
                    {INTERACTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Direction</Label>
                <Select value={direction} onValueChange={setDirection}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portal={false}>
                    {INTERACTION_DIRECTIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Template prefill */}
            {!interaction && templates.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3 w-3" />
                  Prefill from template
                </Label>
                <Select onValueChange={handleApplyTemplate}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        <span className="flex items-center gap-2">
                          <span>{tpl.name}</span>
                          {tpl.channel && (
                            <span className="text-[10px] text-muted-foreground">
                              {tpl.channel}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Channel</Label>
              <Input
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="email, linkedin, phone..."
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject or headline"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Body</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Full content (optional)"
                rows={6}
                className="text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Occurred</Label>
                <DatePickerButton
                  value={occurredAt}
                  onChange={(v) => setOccurredAt(v ?? new Date().toISOString())}
                  placeholder="Pick a date"
                  portal={false}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Follow-up date</Label>
                <DatePickerButton
                  value={nextActionDate}
                  onChange={setNextActionDate}
                  placeholder="No follow-up"
                  portal={false}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Next action</Label>
              <Input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="e.g. Send follow-up with pricing"
                className="h-9 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 px-6 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : interaction ? "Save" : "Log interaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
