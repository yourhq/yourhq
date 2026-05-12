"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Agent } from "@/lib/agents/types";
import { logAudit } from "@/lib/audit/log";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { TagInput } from "@/components/ui/tag-input";

interface AgentFormProps {
  editingAgent: Agent | null;
  onSave: () => void;
  onCancel: () => void;
}

export function AgentForm({ editingAgent, onSave, onCancel }: AgentFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState(editingAgent?.name ?? "");
  const [slug, setSlug] = useState(editingAgent?.slug ?? "");
  const [description, setDescription] = useState(editingAgent?.description ?? "");
  const [domains, setDomains] = useState<string[]>(editingAgent?.domains ?? []);
  const [capabilities, setCapabilities] = useState<string[]>(editingAgent?.capabilities ?? []);
  const [showDescription, setShowDescription] = useState(!!editingAgent?.description);

  function generateSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  useEffect(() => {
    if (nameRef.current) {
      nameRef.current.style.height = "auto";
      nameRef.current.style.height = nameRef.current.scrollHeight + "px";
    }
  }, [name]);

  async function handleSubmit() {
    if (!name.trim() || !slug.trim()) return;
    setSaving(true);

    try {
      if (editingAgent) {
        const payload = {
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
          domains,
          capabilities,
        };
        const { error } = await supabase.from("agents").update(payload).eq("id", editingAgent.id);
        if (error) throw new Error(error.message);
        logAudit(supabase, {
          module: "agents",
          entity_type: "agent",
          entity_id: editingAgent.id,
          action: "updated",
          summary: `Updated agent '${payload.name}'`,
        });
        toast.success(`Updated ${payload.name}`);
      } else {
        const { createAgentWithBranch } = await import("@/app/dashboard/agents/actions");
        await createAgentWithBranch({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          templateBranch: null,
        });
        toast.success(`Registered ${name.trim()}`);
      }
      onSave();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (name.trim() && slug.trim()) handleSubmit();
    }
  }

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onCancel()}>
      <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-xl p-0 gap-0 overflow-hidden max-h-[85dvh] flex flex-col">
        <ResponsiveDialogTitle className="sr-only">
          {editingAgent ? "Edit agent" : "Register agent"}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="sr-only">
          Register or edit an agent with its name, slug, description, domains, and capabilities.
        </ResponsiveDialogDescription>
        <div className="flex-1 overflow-y-auto min-h-0">
        {/* Name - hero input */}
        <div className="px-4 pt-4 pb-2">
          <textarea
            ref={nameRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!editingAgent) setSlug(generateSlug(e.target.value));
            }}
            onKeyDown={handleNameKeyDown}
            placeholder={editingAgent ? "Agent name" : "What agent are you registering?"}
            autoFocus
            rows={1}
            className="w-full resize-none overflow-hidden border-0 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {/* Slug - always visible, auto-generated */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-muted-foreground/50">slug:</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-generated"
              className="flex-1 border-0 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40 font-mono"
            />
          </div>
          {/* Description - expandable */}
          {showDescription ? (
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do..."
              rows={2}
              className="mt-2 border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none resize-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="mt-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Add description...
            </button>
          )}
        </div>

        {/* Property bar - domains & capabilities as tags */}
        <div className="border-t border-border/50 px-4 py-2.5 space-y-2">
          <div className="flex items-start gap-3">
            <span className="w-20 shrink-0 text-xs text-muted-foreground pt-1">Domains</span>
            <TagInput
              value={domains}
              onChange={setDomains}
              placeholder="crm, tasks, content..."
              className="flex-1"
            />
          </div>
          <div className="flex items-start gap-3">
            <span className="w-20 shrink-0 text-xs text-muted-foreground pt-1">Capabilities</span>
            <TagInput
              value={capabilities}
              onChange={setCapabilities}
              placeholder="research, outreach..."
              className="flex-1"
            />
          </div>
        </div>

        </div>{/* end scrollable area */}

        {/* Submit bar */}
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 shrink-0">
          <p className="text-[11px] text-muted-foreground/50">
            Press Enter to {editingAgent ? "save" : "register"}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={saving || !name.trim() || !slug.trim()}>
              {saving && <Spinner className="mr-1.5 h-3 w-3" />}
              {saving ? "Saving..." : editingAgent ? "Save" : "Register"}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
