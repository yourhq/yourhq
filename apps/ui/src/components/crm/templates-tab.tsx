"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Template } from "@/lib/crm/types";
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
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Archive, RotateCcw, Copy } from "lucide-react";
import { toast } from "sonner";

export function TemplatesTab() {
  const mobile = useIsMobile();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setTemplates(data as Template[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTemplates();
  }, [fetchTemplates]);

  async function handleToggleActive(template: Template) {
    const newActive = !template.is_active;
    await supabase
      .from("templates")
      .update({ is_active: newActive })
      .eq("id", template.id);
    logAudit(supabase, {
      module: "crm",
      entity_type: "template",
      entity_id: template.id,
      action: newActive ? "restored" : "archived",
      summary: `${newActive ? "Restored" : "Archived"} template '${template.name}'`,
    });
    fetchTemplates();
    toast.success(template.is_active ? "Template archived" : "Template restored");
  }

  return (
    <div className="flex h-full flex-col overflow-auto p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {templates.length} template{templates.length !== 1 ? "s" : ""}
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
          New Template
        </Button>
      </div>

      {loading ? (
        <p className="text-center text-xs text-muted-foreground py-8">Loading...</p>
      ) : templates.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-8">
          No templates yet. Create one to get started.
        </p>
      ) : mobile ? (
        <div className="space-y-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border border-border/50 p-3 text-left transition-colors active:bg-accent/50"
              onClick={() => { setEditing(template); setShowForm(true); }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{template.name}</span>
                  <StatusDot
                    color={template.is_active ? "#4ade80" : "#6b7280"}
                    label={template.is_active ? "Active" : "Archived"}
                  />
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                  {template.channel && <span>{template.channel}</span>}
                  {template.subject && <span className="truncate">{template.subject}</span>}
                  <span>{template.use_count} uses</span>
                </div>
              </div>
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
                <TableHead className="h-7 py-0 text-xs hidden sm:table-cell">Stage</TableHead>
                <TableHead className="h-7 py-0 text-xs hidden md:table-cell">Subject</TableHead>
                <TableHead className="h-7 py-0 text-xs hidden sm:table-cell text-right">Used</TableHead>
                <TableHead className="h-7 py-0 text-xs">Status</TableHead>
                <TableHead className="h-7 py-0 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id} className="border-b border-border/50 hover:bg-accent/40 group">
                  <TableCell className="py-1.5 px-3 text-sm font-medium">{template.name}</TableCell>
                  <TableCell className="py-1.5 px-3 hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {template.channel || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 px-3 hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {template.stage || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 px-3 hidden md:table-cell max-w-[200px] truncate">
                    <span className="text-xs text-muted-foreground">{template.subject || "—"}</span>
                  </TableCell>
                  <TableCell className="py-1.5 px-3 hidden sm:table-cell text-right">
                    <span className="text-xs text-muted-foreground tabular-nums">{template.use_count}</span>
                  </TableCell>
                  <TableCell className="py-1.5 px-3">
                    <StatusDot
                      color={template.is_active ? "#4ade80" : "#6b7280"}
                      label={template.is_active ? "Active" : "Archived"}
                    />
                  </TableCell>
                  <TableCell className="py-1.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setEditing(template);
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
                        onClick={() => {
                          navigator.clipboard.writeText(template.body);
                          toast.success("Template body copied");
                        }}
                        title="Copy body"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleToggleActive(template)}
                        title={template.is_active ? "Archive" : "Restore"}
                      >
                        {template.is_active ? (
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

      <TemplateForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        template={editing}
        onSaved={() => {
          setShowForm(false);
          setEditing(null);
          fetchTemplates();
        }}
      />
    </div>
  );
}

function TemplateForm({
  open,
  onClose,
  template,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  template: Template | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("");
  const [stage, setStage] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (template) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(template.name);
      setChannel(template.channel || "");
      setStage(template.stage || "");
      setSubject(template.subject || "");
      setBody(template.body);
    } else {
      setName("");
      setChannel("");
      setStage("");
      setSubject("");
      setBody("");
    }
  }, [template, open]);

  async function handleSubmit() {
    if (!name.trim() || !body.trim()) return;

    setSaving(true);
    const data = {
      name: name.trim(),
      channel: channel || null,
      stage: stage || null,
      subject: subject.trim() || null,
      body: body.trim(),
    };

    if (template) {
      await supabase.from("templates").update(data).eq("id", template.id);
      logAudit(supabase, {
        module: "crm",
        entity_type: "template",
        entity_id: template.id,
        action: "updated",
        summary: `Updated template '${data.name}'`,
      });
      toast.success("Template updated");
    } else {
      const { data: inserted } = await supabase.from("templates").insert(data).select("id").single();
      if (inserted) {
        logAudit(supabase, {
          module: "crm",
          entity_type: "template",
          entity_id: inserted.id,
          action: "created",
          summary: `Created template '${data.name}'`,
        });
      }
      toast.success("Template created");
    }

    setSaving(false);
    onSaved();
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (name.trim() && body.trim()) handleSubmit();
    }
  }

  if (!open) return null;

  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-2xl p-0 gap-0 overflow-hidden max-h-[85dvh] flex flex-col">
        <ResponsiveDialogTitle className="sr-only">
          {template ? "Edit template" : "New template"}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="sr-only">
          Create or edit a reusable outreach template.
        </ResponsiveDialogDescription>
        <div className="flex-1 overflow-y-auto min-h-0">
        {/* Name - hero input */}
        <div className="px-4 pt-4 pb-2">
          <textarea
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            placeholder={template ? "Template name" : "Name this template..."}
            autoFocus
            rows={1}
            className="w-full resize-none overflow-hidden border-0 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {/* Subject line - secondary */}
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line (optional)"
            className="w-full border-0 bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/40 mt-0.5"
          />
        </div>

        {/* Property bar - channel + stage tokens */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-4 py-2.5">
          <Input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="Channel (e.g. email)"
            className="h-6 w-32 text-xs bg-transparent border-border/50"
          />
          <Input
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            placeholder="Stage (e.g. intro)"
            className="h-6 w-32 text-xs bg-transparent border-border/50"
          />
          <span className="text-[10px] text-muted-foreground/40 ml-auto">
            {"{{name}} {{company}} {{title}}"}
          </span>
        </div>

        {/* Body - main content area */}
        <div className="border-t border-border/50 px-4 py-2.5">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"Hi {{name}},\n\nI wanted to reach out about..."}
            rows={12}
            className="text-sm resize-none border-border/50 bg-transparent shadow-none focus-visible:ring-0"
          />
        </div>

        </div>{/* end scrollable area */}

        {/* Submit bar */}
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] text-muted-foreground/50">
              {template ? "Save changes" : "Name + body required"}
            </p>
            {body.trim() && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(body);
                  toast.success("Template body copied");
                }}
              >
                <Copy className="mr-1 h-3 w-3" />
                Copy
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={saving || !name.trim() || !body.trim()}>
              {saving ? "Saving..." : template ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
