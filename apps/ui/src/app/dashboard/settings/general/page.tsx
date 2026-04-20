"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sliders, ChevronRight, Globe } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
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

const ALL_TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Anchorage",
      "Pacific/Honolulu",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Kolkata",
      "Australia/Sydney",
      "Pacific/Auckland",
    ];
  }
})();

export default function GeneralSettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Workspace fields
  const [wsName, setWsName] = useState("");
  const [wsSlug, setWsSlug] = useState("");
  const [wsSlugTouched, setWsSlugTouched] = useState(false);
  const [wsDescription, setWsDescription] = useState("");

  // Profile fields
  const [ownerName, setOwnerName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [tzQuery, setTzQuery] = useState("");
  const [showTzDropdown, setShowTzDropdown] = useState(false);

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
          setOwnerName(ws.owner_name ?? "");
          setPreferredName(ws.owner_preferred_name ?? "");
          setTimezone(ws.owner_timezone ?? "");
          setTzQuery(ws.owner_timezone ?? "");
        }
        setLoading(false);
      });
  }, [supabase]);

  const filteredTimezones = useMemo(() => {
    const q = tzQuery.trim().toLowerCase();
    if (!q) return ALL_TIMEZONES.slice(0, 20);
    return ALL_TIMEZONES.filter((tz) =>
      tz.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [tzQuery]);

  function autoDetectTimezone() {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(detected);
      setTzQuery(detected);
    } catch {
      toast.error("Couldn't detect timezone");
    }
  }

  const handleSave = useCallback(async () => {
    setSaving(true);

    const payload = {
      name: wsName.trim() || "HQ",
      slug: wsSlug.trim() || null,
      description: wsDescription.trim() || null,
      owner_name: ownerName.trim() || null,
      owner_preferred_name: preferredName.trim() || null,
      owner_timezone: timezone.trim() || null,
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
        summary: "Updated workspace profile",
      });
    } else {
      const { data, error } = await supabase
        .from("workspace")
        .insert(payload)
        .select("id")
        .single();

      if (error || !data) {
        toast.error("Failed to save");
        setSaving(false);
        return;
      }

      setWorkspaceId(data.id);
      logAudit(supabase, {
        module: "settings",
        entity_type: "workspace",
        entity_id: data.id,
        action: "created",
        summary: "Created workspace profile",
      });
    }

    toast.success("Saved");
    setSaving(false);
  }, [supabase, workspaceId, wsName, wsSlug, wsDescription, ownerName, preferredName, timezone]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Sliders className="h-4 w-4" />}
        title="General"
        description="Workspace preferences."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl">
          {loading ? (
            <PageSection>
              <div className="space-y-4">
                {[0, 1, 2, 3, 4].map((i) => (
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
                    <div className="flex items-center gap-1.5">
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
                    </div>
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

              <PageSection
                title="Your profile"
                description="Shared with agents via USER.md when they're created."
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-muted-foreground">
                      Name
                    </label>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full h-9 rounded-md border border-border/60 bg-transparent px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-muted-foreground">
                      Preferred name
                    </label>
                    <input
                      type="text"
                      value={preferredName}
                      onChange={(e) => setPreferredName(e.target.value)}
                      placeholder="What agents should call you"
                      className="w-full h-9 rounded-md border border-border/60 bg-transparent px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-muted-foreground">
                      Timezone
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={tzQuery}
                        onChange={(e) => {
                          setTzQuery(e.target.value);
                          setShowTzDropdown(true);
                        }}
                        onFocus={() => setShowTzDropdown(true)}
                        onBlur={() => {
                          setTimeout(() => setShowTzDropdown(false), 150);
                        }}
                        placeholder="America/New_York"
                        className="w-full h-9 rounded-md border border-border/60 bg-transparent px-3 pr-20 text-sm outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40 font-mono"
                      />
                      <button
                        type="button"
                        onClick={autoDetectTimezone}
                        className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/40 transition-colors"
                        title="Auto-detect timezone"
                      >
                        <Globe className="h-3 w-3" />
                        Detect
                      </button>
                      {showTzDropdown && filteredTimezones.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border/60 bg-popover shadow-md">
                          {filteredTimezones.map((tz) => (
                            <button
                              key={tz}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setTimezone(tz);
                                setTzQuery(tz);
                                setShowTzDropdown(false);
                              }}
                              className="flex w-full items-center px-3 py-1.5 text-sm font-mono hover:bg-accent text-left"
                            >
                              {tz}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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

              <PageSection title="Configuration">
                <div className="space-y-1.5">
                  <Link
                    href="/dashboard/settings/pipeline"
                    className="group flex items-center gap-3 rounded-md border border-border/60 bg-card px-4 py-3 transition-colors hover:border-border-strong hover:bg-accent/60"
                  >
                    <span className="flex-1 text-[13px] text-foreground">
                      Configure pipeline stages
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                  </Link>
                  <Link
                    href="/dashboard/settings/fields"
                    className="group flex items-center gap-3 rounded-md border border-border/60 bg-card px-4 py-3 transition-colors hover:border-border-strong hover:bg-accent/60"
                  >
                    <span className="flex-1 text-[13px] text-foreground">
                      Configure custom fields
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                  </Link>
                </div>
              </PageSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
