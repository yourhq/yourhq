"use client";

import { useState } from "react";
import type { CollectionTemplate } from "@/lib/collections/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Sparkles } from "lucide-react";

interface CollectionCreateDialogProps {
  open: boolean;
  onClose: () => void;
  templates: CollectionTemplate[];
  onCreateBlank: (input: { name: string; slug: string; description?: string }) => Promise<unknown>;
  onInstallTemplate: (template: CollectionTemplate) => Promise<unknown>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function CollectionCreateDialog({
  open,
  onClose,
  templates,
  onCreateBlank,
  onInstallTemplate,
}: CollectionCreateDialogProps) {
  const [tab, setTab] = useState<"template" | "blank">(templates.length > 0 ? "template" : "blank");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) return;
    setSaving(true);
    try {
      await onCreateBlank({ name: name.trim(), slug: slug.trim(), description: description.trim() || undefined });
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleInstall = async (t: CollectionTemplate) => {
    setSaving(true);
    try {
      await onInstallTemplate(t);
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setName("");
    setSlug("");
    setDescription("");
    setSlugTouched(false);
    setTab(templates.length > 0 ? "template" : "blank");
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>New Collection</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Create a custom table to track anything, or start from a template.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "template" | "blank")}>
          <TabsList className="w-full">
            {templates.length > 0 && (
              <TabsTrigger value="template" className="flex-1 gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Templates
              </TabsTrigger>
            )}
            <TabsTrigger value="blank" className="flex-1 gap-1.5">
              <Database className="h-3.5 w-3.5" />
              Blank
            </TabsTrigger>
          </TabsList>

          {templates.length > 0 && (
            <TabsContent value="template" className="mt-3 space-y-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={saving}
                  onClick={() => handleInstall(t)}
                  className="flex w-full items-start gap-3 rounded-md border border-border/60 p-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-50"
                >
                  <span className="text-lg">{t.icon ?? "📋"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-heading">{t.name}</div>
                    {t.description && (
                      <div className="text-body text-muted-foreground mt-0.5">
                        {t.description}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </TabsContent>
          )}

          <TabsContent value="blank" className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Job Applications"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Slug</Label>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                placeholder="job-applications"
              />
              <p className="text-[11px] text-muted-foreground">
                Used in URLs and API references
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this collection for?"
                rows={2}
              />
            </div>
            <ResponsiveDialogFooter>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving || !name.trim() || !slug.trim()}>
                Create Collection
              </Button>
            </ResponsiveDialogFooter>
          </TabsContent>
        </Tabs>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
