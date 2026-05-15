export interface ThemeConfig {
  brandColor: OklchColor;
  mode: "light" | "dark" | "system";
  surfaceWarmth: number;
  overrides?: Partial<ThemeTokens>;
}

export interface OklchColor {
  l: number;
  c: number;
  h: number;
}

export interface ThemeTokens {
  background: string;
  foreground: string;
  card: string;
  "card-foreground": string;
  popover: string;
  "popover-foreground": string;
  muted: string;
  "muted-foreground": string;
  accent: string;
  "accent-foreground": string;
  secondary: string;
  "secondary-foreground": string;
  primary: string;
  "primary-foreground": string;
  destructive: string;
  border: string;
  input: string;
  ring: string;
  "sidebar-primary": string;
  "status-success": string;
  "status-warning": string;
  "status-error": string;
  "status-info": string;
  "status-progress": string;
  "status-neutral": string;
  "accent-blue": string;
  "accent-purple": string;
  "accent-emerald": string;
  "accent-cyan": string;
  "accent-violet": string;
  "accent-amber": string;
  "accent-teal": string;
  "accent-orange": string;
  "accent-pink": string;
  "accent-slate": string;
  "accent-indigo": string;
  "accent-sky": string;
}

export const DEFAULT_BRAND: OklchColor = { l: 0.63, c: 0.145, h: 35 };
export const DEFAULT_WARMTH = 0.004;

export const DEFAULT_THEME: ThemeConfig = {
  brandColor: DEFAULT_BRAND,
  mode: "system",
  surfaceWarmth: DEFAULT_WARMTH,
};

export const ADVANCED_TOKEN_GROUPS = [
  {
    label: "Surfaces",
    tokens: ["background", "card", "popover", "muted", "accent", "secondary"] as const,
  },
  {
    label: "Semantic",
    tokens: [
      "destructive",
      "status-success",
      "status-warning",
      "status-error",
      "status-info",
    ] as const,
  },
  {
    label: "Accents",
    tokens: [
      "accent-blue",
      "accent-purple",
      "accent-emerald",
      "accent-cyan",
      "accent-violet",
      "accent-amber",
      "accent-teal",
      "accent-orange",
      "accent-pink",
      "accent-indigo",
      "accent-sky",
    ] as const,
  },
  {
    label: "Text",
    tokens: ["foreground", "muted-foreground"] as const,
  },
  {
    label: "Borders",
    tokens: ["border"] as const,
  },
] as const;
