"use client";

import { useState, useRef, useEffect } from "react";
import type { CollectionTemplate } from "@/lib/collections/types";
import { VIEW_TYPE_LABELS } from "@/lib/collections/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import {
  Database,
  Table,
  Columns,
  Calendar,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

const VIEW_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  table: Table,
  kanban: Columns,
  calendar: Calendar,
};

export function CollectionCreateDialog({
  open,
  onClose,
  templates,
  onCreateBlank,
  onInstallTemplate,
}: CollectionCreateDialogProps) {
  const [step, setStep] = useState<"pick" | "name">("pick");
  const [selectedTemplate, setSelectedTemplate] = useState<CollectionTemplate | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep("pick");
      setSelectedTemplate(null);
      setName("");
      setSaving(false);
    }
  }, [open]);

  useEffect(() => {
    if (step === "name") {
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [step]);

  const handlePickBlank = () => {
    setSelectedTemplate(null);
    setStep("name");
  };

  const handlePickTemplate = (t: CollectionTemplate) => {
    setSelectedTemplate(t);
    setName(t.name);
    setStep("name");
  };

  const handleCreate = async () => {
    const finalName = name.trim();
    if (!finalName) return;
    setSaving(true);
    try {
      if (selectedTemplate) {
        await onInstallTemplate(selectedTemplate);
      } else {
        await onCreateBlank({ name: finalName, slug: slugify(finalName) });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim() && !saving) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-[520px] gap-0 overflow-hidden">
        <ResponsiveDialogHeader className="px-5 pt-5 pb-0">
          <ResponsiveDialogTitle className="text-base">
            {step === "pick" ? "New Collection" : (
              <button
                type="button"
                onClick={() => { setStep("pick"); setName(""); setSelectedTemplate(null); }}
                className="inline-flex items-center gap-1.5 text-base font-semibold hover:text-muted-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                {selectedTemplate ? selectedTemplate.name : "Blank Collection"}
              </button>
            )}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[13px]">
            {step === "pick"
              ? "Track anything with custom fields and views."
              : "Give your collection a name to get started."}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {step === "pick" ? (
          <div className="px-5 pt-4 pb-5">
            <div className="grid grid-cols-2 gap-2.5">
              {/* Blank card */}
              <button
                type="button"
                onClick={handlePickBlank}
                className="group relative flex flex-col items-start gap-3 rounded-lg border border-border/60 p-4 text-left transition-all hover:border-foreground/20 hover:bg-accent/40"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <Database className="h-4.5 w-4.5" />
                </div>
                <div>
                  <div className="text-[13px] font-medium">Start from scratch</div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground leading-snug">
                    Empty collection with custom fields
                  </div>
                </div>
                <ArrowRight className="absolute right-3 top-4 h-3.5 w-3.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/60" />
              </button>

              {/* Template cards */}
              {templates.map((t) => {
                const viewTypes = t.definition.views?.map((v) => v.view_type) ?? [];
                const fieldCount = t.definition.fields?.length ?? 0;

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handlePickTemplate(t)}
                    className="group relative flex flex-col items-start gap-3 rounded-lg border border-border/60 p-4 text-left transition-all hover:border-foreground/20 hover:bg-accent/40"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 text-lg transition-colors group-hover:bg-primary/10">
                      {t.icon ?? "📋"}
                    </div>
                    <div>
                      <div className="text-[13px] font-medium">{t.name}</div>
                      {t.description && (
                        <div className="mt-0.5 text-[12px] text-muted-foreground leading-snug line-clamp-2">
                          {t.description}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
                      <span>{fieldCount} fields</span>
                      {viewTypes.length > 0 && (
                        <>
                          <span className="text-border">·</span>
                          <span className="flex items-center gap-1">
                            {viewTypes.map((vt) => {
                              const Icon = VIEW_ICONS[vt];
                              return Icon ? (
                                <span key={vt} className="inline-flex items-center gap-0.5" title={VIEW_TYPE_LABELS[vt]}>
                                  <Icon className="h-3 w-3" />
                                </span>
                              ) : null;
                            })}
                          </span>
                        </>
                      )}
                    </div>
                    <ArrowRight className="absolute right-3 top-4 h-3.5 w-3.5 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/60" />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="px-5 pt-4 pb-5">
            {selectedTemplate && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {selectedTemplate.definition.fields?.map((f) => (
                  <span
                    key={f.field_key}
                    className="inline-flex items-center rounded-md bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {f.label}
                  </span>
                ))}
                {selectedTemplate.definition.views?.map((v) => {
                  const Icon = VIEW_ICONS[v.view_type];
                  return (
                    <span
                      key={v.name}
                      className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                    >
                      {Icon && <Icon className="h-3 w-3" />}
                      {VIEW_TYPE_LABELS[v.view_type]}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedTemplate ? selectedTemplate.name : "e.g. Job Applications"}
                className={cn(
                  "h-10 flex-1 text-[14px]",
                  saving && "opacity-60"
                )}
                disabled={saving}
              />
              <Button
                onClick={handleCreate}
                disabled={saving || !name.trim()}
                className="h-10 px-5"
              >
                Create
              </Button>
            </div>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
