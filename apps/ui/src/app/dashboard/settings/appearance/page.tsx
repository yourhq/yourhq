"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Palette, Sun, Moon, Monitor, ChevronDown, RotateCcw } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit/log";
import { PageHeader, PageSection } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { ThemeConfig, OklchColor, ThemeTokens } from "@/lib/theme/types";
import {
  DEFAULT_BRAND,
  DEFAULT_WARMTH,
  DEFAULT_THEME,
  ADVANCED_TOKEN_GROUPS,
} from "@/lib/theme/types";
import {
  deriveLightTokens,
  deriveDarkTokens,
  oklchToHex,
  hexToOklch,
  formatOklch,
  parseOklch,
} from "@/lib/theme/derive";

const BRAND_PRESETS: { label: string; color: OklchColor }[] = [
  { label: "Coral", color: { l: 0.63, c: 0.145, h: 35 } },
  { label: "Blue", color: { l: 0.55, c: 0.16, h: 250 } },
  { label: "Violet", color: { l: 0.55, c: 0.16, h: 290 } },
  { label: "Emerald", color: { l: 0.55, c: 0.14, h: 162 } },
  { label: "Amber", color: { l: 0.6, c: 0.15, h: 70 } },
  { label: "Rose", color: { l: 0.55, c: 0.18, h: 350 } },
  { label: "Indigo", color: { l: 0.5, c: 0.16, h: 275 } },
  { label: "Teal", color: { l: 0.55, c: 0.12, h: 195 } },
];

const MODE_OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
  { value: "system" as const, label: "System", icon: Monitor },
];

function ColorSwatch({
  color,
  selected,
  onClick,
  size = "md",
  label,
}: {
  color: string;
  selected?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative rounded-full border-2 transition-all",
        size === "md" ? "h-9 w-9" : "h-6 w-6",
        selected
          ? "border-foreground scale-110 shadow-sm"
          : "border-transparent hover:border-foreground/20 hover:scale-105",
      )}
      title={label}
    >
      <span
        className="absolute inset-0.5 rounded-full"
        style={{ backgroundColor: color }}
      />
    </button>
  );
}

function TokenEditor({
  token,
  value,
  derived,
  onChange,
  onReset,
}: {
  token: string;
  value: string | undefined;
  derived: string;
  onChange: (token: string, value: string) => void;
  onReset: (token: string) => void;
}) {
  const display = value ?? derived;
  const parsed = parseOklch(display);
  const hexValue = parsed ? oklchToHex(parsed) : "#888888";
  const isOverridden = value !== undefined;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <input
          type="color"
          value={hexValue}
          onChange={(e) => {
            const oklch = hexToOklch(e.target.value);
            onChange(token, formatOklch(oklch));
          }}
          className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border/60 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none"
        />
        <span className="text-xs font-mono text-muted-foreground truncate">
          {token}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] font-mono text-muted-foreground/60 max-w-[140px] truncate hidden sm:inline">
          {display}
        </span>
        {isOverridden && (
          <button
            type="button"
            onClick={() => onReset(token)}
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
            title="Reset to derived"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function AppearanceSettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { theme: currentTheme, setTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [brandColor, setBrandColor] = useState<OklchColor>(DEFAULT_BRAND);
  const [mode, setMode] = useState<"light" | "dark" | "system">("system");
  const [warmth, setWarmth] = useState(DEFAULT_WARMTH);
  const [overrides, setOverrides] = useState<Partial<ThemeTokens>>({});

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    supabase
      .from("workspace")
      .select("id, settings")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWorkspaceId(data.id);
          const settings = data.settings as Record<string, unknown> | undefined;
          const theme = settings?.theme as ThemeConfig | undefined;
          if (theme) {
            setBrandColor(theme.brandColor ?? DEFAULT_BRAND);
            setMode(theme.mode ?? "system");
            setWarmth(theme.surfaceWarmth ?? DEFAULT_WARMTH);
            setOverrides(theme.overrides ?? {});
          }
        }
        setLoading(false);
      });
  }, [supabase]);

  const lightTokens = useMemo(
    () => deriveLightTokens(brandColor, warmth),
    [brandColor, warmth],
  );
  const darkTokens = useMemo(
    () => deriveDarkTokens(brandColor, warmth),
    [brandColor, warmth],
  );
  const isDark = currentTheme === "dark";
  const activeTokens = isDark ? darkTokens : lightTokens;

  const handleModeChange = useCallback(
    (newMode: "light" | "dark" | "system") => {
      setMode(newMode);
      setTheme(newMode);
    },
    [setTheme],
  );

  const handleOverrideChange = useCallback(
    (token: string, value: string) => {
      setOverrides((prev) => ({ ...prev, [token]: value }));
    },
    [],
  );

  const handleOverrideReset = useCallback(
    (token: string) => {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[token as keyof ThemeTokens];
        return next;
      });
    },
    [],
  );

  const handleResetAll = useCallback(() => {
    setBrandColor(DEFAULT_BRAND);
    setWarmth(DEFAULT_WARMTH);
    setOverrides({});
    setMode("system");
    setTheme("system");
  }, [setTheme]);

  const handleSave = useCallback(async () => {
    if (!workspaceId) return;
    setSaving(true);

    const themeConfig: ThemeConfig = {
      brandColor,
      mode,
      surfaceWarmth: warmth,
      overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
    };

    const { data: ws } = await supabase
      .from("workspace")
      .select("settings")
      .eq("id", workspaceId)
      .maybeSingle();
    const currentSettings = (ws?.settings as Record<string, unknown>) ?? {};

    const { error } = await supabase
      .from("workspace")
      .update({
        settings: { ...currentSettings, theme: themeConfig },
      })
      .eq("id", workspaceId);

    if (error) {
      toast.error("Failed to save theme");
      setSaving(false);
      return;
    }

    logAudit(supabase, {
      module: "settings",
      entity_type: "workspace",
      entity_id: workspaceId,
      action: "updated",
      summary: "Updated theme settings",
    });

    toast.success("Theme saved");
    setSaving(false);
  }, [supabase, workspaceId, brandColor, mode, warmth, overrides]);

  const previewStyle = useMemo(() => {
    const tokens = { ...activeTokens, ...overrides };
    const style: Record<string, string> = {};
    for (const [k, v] of Object.entries(tokens)) {
      style[`--${k}`] = v;
    }
    return style;
  }, [activeTokens, overrides]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader
          icon={<Palette className="h-4 w-4" />}
          title="Appearance"
          description="Customize your workspace theme and colors."
        />
        <div className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-2xl p-5 space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted/20 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Palette className="h-4 w-4" />}
        title="Appearance"
        description="Customize your workspace theme and colors."
        primaryAction={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={handleResetAll}
            >
              Reset to defaults
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl">
          {/* Brand Color */}
          <PageSection title="Brand color" description="Your primary brand color used across buttons, links, and active states.">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {BRAND_PRESETS.map((preset) => (
                  <ColorSwatch
                    key={preset.label}
                    color={oklchToHex(preset.color)}
                    selected={
                      preset.color.h === brandColor.h &&
                      Math.abs(preset.color.l - brandColor.l) < 0.01
                    }
                    onClick={() => setBrandColor(preset.color)}
                    label={preset.label}
                  />
                ))}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={oklchToHex(brandColor)}
                  onChange={(e) => setBrandColor(hexToOklch(e.target.value))}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border/60 bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none"
                />
                <div className="space-y-0.5">
                  <span className="text-xs font-mono text-muted-foreground">
                    {oklchToHex(brandColor)}
                  </span>
                  <span className="block text-[10px] font-mono text-muted-foreground/50">
                    {formatOklch(brandColor)}
                  </span>
                </div>
              </div>

              {/* Live preview strip */}
              <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3" style={previewStyle as React.CSSProperties}>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: `var(--primary, ${oklchToHex(brandColor)})` }} />
                  <span className="text-xs font-medium" style={{ color: `var(--foreground)` }}>Preview</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: `var(--primary, ${oklchToHex(brandColor)})`,
                      color: `var(--primary-foreground, white)`,
                    }}
                  >
                    Primary button
                  </button>
                  <button
                    type="button"
                    className="rounded-md border px-3 py-1.5 text-xs font-medium"
                    style={{
                      borderColor: `var(--border)`,
                      color: `var(--foreground)`,
                    }}
                  >
                    Secondary
                  </button>
                  <span
                    className="text-xs underline underline-offset-2 cursor-pointer"
                    style={{ color: `var(--primary, ${oklchToHex(brandColor)})` }}
                  >
                    Link text
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(["status-success", "status-warning", "status-error", "status-info"] as const).map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: `color-mix(in oklch, var(--${s}) 15%, transparent)`,
                        color: `var(--${s})`,
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `var(--${s})` }} />
                      {s.replace("status-", "")}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </PageSection>

          {/* Mode */}
          <PageSection title="Mode" description="Choose between light, dark, or system-matched appearance.">
            {mounted && (
              <div className="flex gap-2">
                {MODE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = mode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleModeChange(opt.value)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-all",
                        isActive
                          ? "border-primary bg-primary/5 text-foreground font-medium"
                          : "border-border/60 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </PageSection>

          {/* Surface Warmth */}
          <PageSection title="Surface warmth" description="Controls the warm tint on neutral surfaces. Zero gives you cool grays.">
            <div className="flex items-center gap-4 max-w-sm">
              <span className="text-[11px] text-muted-foreground shrink-0">Cool</span>
              <Slider
                value={[warmth * 1000]}
                min={0}
                max={8}
                step={0.5}
                onValueChange={([v]) => setWarmth(v / 1000)}
                className="flex-1"
              />
              <span className="text-[11px] text-muted-foreground shrink-0">Warm</span>
              <span className="text-[10px] font-mono text-muted-foreground/50 w-10 text-right">
                {warmth.toFixed(3)}
              </span>
            </div>
          </PageSection>

          {/* Advanced */}
          <PageSection>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  showAdvanced && "rotate-180",
                )}
              />
              Advanced color overrides
              {Object.keys(overrides).length > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {Object.keys(overrides).length} override{Object.keys(overrides).length !== 1 ? "s" : ""}
                </span>
              )}
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-5">
                <p className="text-xs text-muted-foreground">
                  Override individual tokens. These take precedence over the derived values from your brand color and warmth settings.
                </p>

                {Object.keys(overrides).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOverrides({})}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Clear all overrides
                  </button>
                )}

                {ADVANCED_TOKEN_GROUPS.map((group) => (
                  <div key={group.label}>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                      {group.label}
                    </h4>
                    <div className="divide-y divide-border/40">
                      {group.tokens.map((token) => (
                        <TokenEditor
                          key={token}
                          token={token}
                          value={overrides[token as keyof ThemeTokens]}
                          derived={activeTokens[token as keyof ThemeTokens]}
                          onChange={handleOverrideChange}
                          onReset={handleOverrideReset}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PageSection>
        </div>
      </div>
    </div>
  );
}
