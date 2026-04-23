"use client";

import { useRef, useEffect } from "react";
import type { WizardState } from "../setup-wizard";

// Used when auto-generating the slug from the workspace name — that source
// is arbitrary prose, so we fully sanitize (lowercase, collapse non-alnum
// runs into dashes, trim leading/trailing dashes).
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// Used when the user is typing directly into the slug field. We keep
// only valid slug characters and collapse invalid runs into a single
// dash — but we do NOT strip trailing dashes while the user is typing,
// because otherwise pressing "-" in the middle of typing "foo-bar" would
// silently delete the character (slugify would re-strip the trailing -
// before the "b" arrives). Trailing-dash cleanup happens on blur.
function sanitizeSlugInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 40);
}

interface Props {
  name: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  onChange: (updates: Partial<WizardState>) => void;
}

export function StepWorkspace({ name, slug, slugTouched, description, onChange }: Props) {
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[15px] font-semibold text-foreground">
          Name your workspace
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          The slug becomes the prefix for agent branches.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-muted-foreground">
            Name
          </label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => {
              onChange({
                name: e.target.value,
                ...(!slugTouched ? { slug: slugify(e.target.value) } : {}),
              });
            }}
            placeholder="HQ"
            className="w-full h-9 rounded-md border border-border/60 bg-transparent px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-muted-foreground">
            Slug
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              onChange({
                slug: sanitizeSlugInput(e.target.value),
                slugTouched: true,
              });
            }}
            onBlur={() => {
              if (!slug.trim()) {
                onChange({ slug: slugify(name), slugTouched: false });
              } else {
                // Strip trailing dashes that the permissive typing sanitizer
                // allowed (e.g. user typed "flight-" and tabbed away).
                const cleaned = slug.replace(/-+$/g, "");
                if (cleaned !== slug) {
                  onChange({ slug: cleaned, slugTouched: true });
                }
              }
            }}
            placeholder="auto-generated"
            className="w-full h-9 rounded-md border border-border/60 bg-transparent px-3 text-sm font-mono outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
          />
          <p className="text-[11px] text-muted-foreground/50">
            Agent branches:{" "}
            <span className="font-mono">{slug || "workspace"}/agent-name</span>
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-muted-foreground">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="What this workspace is for..."
            rows={2}
            className="w-full rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm outline-none resize-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
          />
        </div>
      </div>
    </div>
  );
}
