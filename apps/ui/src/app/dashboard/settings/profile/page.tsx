"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { User, Globe } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit/log";
import { PageHeader, PageSection } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

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

export default function ProfileSettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [ownerName, setOwnerName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [tzQuery, setTzQuery] = useState("");
  const [showTzDropdown, setShowTzDropdown] = useState(false);

  useEffect(() => {
    supabase
      .from("workspace")
      .select("id, owner_name, owner_preferred_name, owner_timezone")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWorkspaceId(data.id);
          setOwnerName(data.owner_name ?? "");
          setPreferredName(data.owner_preferred_name ?? "");
          setTimezone(data.owner_timezone ?? "");
          setTzQuery(data.owner_timezone ?? "");
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
    if (!workspaceId) return;
    setSaving(true);

    const payload = {
      owner_name: ownerName.trim() || null,
      owner_preferred_name: preferredName.trim() || null,
      owner_timezone: timezone.trim() || null,
    };

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
      summary: "Updated profile settings",
    });

    toast.success("Saved");
    setSaving(false);
  }, [supabase, workspaceId, ownerName, preferredName, timezone]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<User className="h-4 w-4" />}
        title="Profile"
        description="Your identity — shared with agents via USER.md."
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
              <PageSection title="Your profile">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-muted-foreground">
                      Full name
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
                    <p className="text-[11px] text-muted-foreground/50">
                      Used for scheduling routines and formatting dates.
                    </p>
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
