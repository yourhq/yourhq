"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sliders } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit/log";
import type { Workspace } from "@/lib/workspace/types";
import { PageHeader, PageSection } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export default function GeneralSettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [wsName, setWsName] = useState("");
  const [wsSlug, setWsSlug] = useState("");
  const [wsSlugTouched, setWsSlugTouched] = useState(false);
  const [wsDescription, setWsDescription] = useState("");

  useEffect(() => {
    supabase
      .from("workspace")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const ws = data as Workspace;
          setWorkspaceId(ws.id);
          setWsName(ws.name ?? "");
          setWsSlug(ws.slug ?? "");
          if (ws.slug) setWsSlugTouched(true);
          setWsDescription(ws.description ?? "");
        }
        setLoading(false);
      });
  }, [supabase]);

  const handleSave = useCallback(async () => {
    setSaving(true);

    const payload = {
      name: wsName.trim() || "HQ",
      slug: wsSlug.trim() || null,
      description: wsDescription.trim() || null,
    };

    if (workspaceId) {
      const { error } = await supabase
        .from("workspace")
        .update(payload)
        .eq("id", workspaceId);

      if (error) {
        toast.error("Failed to save");
        setSaving(false);
        return;
      }

      logAudit(supabase, {
        module: "settings",
        entity_type: "workspace",
        entity_id: workspaceId,
        action: "updated",
        summary: "Updated workspace settings",
      });
    }

    toast.success("Saved");
    setSaving(false);
  }, [supabase, workspaceId, wsName, wsSlug, wsDescription]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Sliders className="h-4 w-4" />}
        title="General"
        description="Workspace identity and branding."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl">
          {loading ? (
            <PageSection>
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 rounded bg-muted/20 animate-pulse" />
                ))}
              </div>
            </PageSection>
          ) : (
            <>
              <PageSection title="Workspace">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-muted-foreground">
                      Name
                    </label>
                    <input
                      type="text"
                      value={wsName}
                      onChange={(e) => {
                        setWsName(e.target.value);
                        if (!wsSlugTouched) setWsSlug(slugify(e.target.value));
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
                      value={wsSlug}
                      onChange={(e) => {
                        setWsSlug(slugify(e.target.value));
                        setWsSlugTouched(true);
                      }}
                      onBlur={() => {
                        if (!wsSlug.trim()) {
                          setWsSlug(slugify(wsName));
                          setWsSlugTouched(false);
                        }
                      }}
                      placeholder="auto-generated"
                      className="w-full h-9 rounded-md border border-border/60 bg-transparent px-3 text-sm font-mono outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
                    />
                    <p className="text-[11px] text-muted-foreground/50">
                      Used as the prefix for agent branches (e.g. <span className="font-mono">{wsSlug || "workspace"}/agent-name</span>)
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-muted-foreground">
                      Description
                    </label>
                    <Textarea
                      value={wsDescription}
                      onChange={(e) => setWsDescription(e.target.value)}
                      placeholder="What this workspace is for..."
                      rows={2}
                      className="border-border/60 bg-transparent text-sm shadow-none resize-none placeholder:text-muted-foreground/40"
                    />
                  </div>
                </div>
              </PageSection>

              <PageSection>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </PageSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
