"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import type { ThemeConfig } from "@/lib/theme/types";
import { DEFAULT_THEME } from "@/lib/theme/types";
import {
  deriveLightTokens,
  deriveDarkTokens,
  buildCssOverrides,
} from "@/lib/theme/derive";

export function ThemeApplier() {
  const { setTheme, resolvedTheme } = useTheme();
  const [config, setConfig] = useState<ThemeConfig | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("workspace")
      .select("settings")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const settings = data?.settings as Record<string, unknown> | undefined;
        const theme = (settings?.theme as ThemeConfig) ?? null;
        if (theme) {
          setConfig(theme);
          if (theme.mode && theme.mode !== "system") {
            setTheme(theme.mode);
          }
        }
      });
  }, [setTheme]);

  if (!config) return null;

  const brand = config.brandColor ?? DEFAULT_THEME.brandColor;
  const warmth = config.surfaceWarmth ?? DEFAULT_THEME.surfaceWarmth;

  const lightTokens = deriveLightTokens(brand, warmth);
  const darkTokens = deriveDarkTokens(brand, warmth);

  const lightOverrides = { ...lightTokens, ...config.overrides };
  const darkOverrides = { ...darkTokens, ...config.overrides };

  const lightCss = buildCssOverrides(lightOverrides);
  const darkCss = buildCssOverrides(darkOverrides);

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `:root {\n  ${lightCss}\n}\n.dark {\n  ${darkCss}\n}`,
      }}
    />
  );
}
