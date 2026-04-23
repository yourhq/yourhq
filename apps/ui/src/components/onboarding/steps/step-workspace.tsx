"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function sanitizeSlugInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 40);
}

export interface StepWorkspaceProps {
  defaults: {
    name: string;
    slug: string;
    description: string;
  };
  onSubmit: (vals: {
    name: string;
    slug: string;
    description: string;
  }) => void;
  pending: boolean;
}

export function StepWorkspace({
  defaults,
  onSubmit,
  pending,
}: StepWorkspaceProps) {
  const [name, setName] = useState(defaults.name);
  const [slug, setSlug] = useState(defaults.slug || slugify(defaults.name));
  const [slugTouched, setSlugTouched] = useState(Boolean(defaults.slug));
  const [description, setDescription] = useState(defaults.description);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const handleSlugBlur = () => {
    if (!slug.trim()) {
      setSlug(slugify(name));
      setSlugTouched(false);
    } else {
      const cleaned = slug.replace(/-+$/g, "");
      if (cleaned !== slug) setSlug(cleaned);
    }
  };

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      slug: slug.trim() || slugify(name),
      description: description.trim(),
    });
  };

  return (
    <form onSubmit={handle} className="space-y-10 pt-8">
      <div className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          Workspace
        </div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
          Name your workspace.
        </h1>
        <p className="max-w-[46ch] text-[14px] leading-relaxed text-muted-foreground">
          This is the space your agents work inside. You can rename it
          anytime.
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-2.5">
          <label className="text-[12px] font-medium text-muted-foreground">
            Workspace name
          </label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Acme ops"
            maxLength={80}
            className="w-full border-0 border-b border-border/60 bg-transparent pb-2 text-[20px] font-medium tracking-tight outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground"
          />
        </div>

        <div className="space-y-2.5">
          <label className="text-[12px] font-medium text-muted-foreground">
            Slug
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(sanitizeSlugInput(e.target.value));
              setSlugTouched(true);
            }}
            onBlur={handleSlugBlur}
            placeholder="auto-generated"
            className="w-full border-0 border-b border-border/40 bg-transparent pb-1.5 font-mono text-[14px] outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground"
          />
          <p className="text-[11px] text-muted-foreground/60">
            Agent branches: <span className="font-mono text-muted-foreground/80">{slug || "workspace"}/agent-name</span>
          </p>
        </div>

        <div className="space-y-2.5">
          <label className="text-[12px] font-medium text-muted-foreground">
            Description <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this workspace is for…"
            rows={2}
            className="w-full resize-none border-0 border-b border-border/40 bg-transparent pb-1.5 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-foreground"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!name.trim() || pending}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
            !name.trim() || pending
              ? "cursor-not-allowed bg-muted text-muted-foreground/50"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {pending ? "Saving…" : "Finish setup"}
          {!pending && (
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </div>
    </form>
  );
}
