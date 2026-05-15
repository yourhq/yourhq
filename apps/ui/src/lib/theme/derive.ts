import type { OklchColor, ThemeTokens } from "./types";

function oklch(l: number, c: number, h: number): string {
  return `oklch(${l} ${c} ${h})`;
}

function oklchAlpha(l: number, c: number, h: number, alpha: string): string {
  return `oklch(${l} ${c} ${h} / ${alpha})`;
}

export function deriveLightTokens(
  brand: OklchColor,
  warmth: number,
): ThemeTokens {
  const bh = 75;
  return {
    background: oklch(0.985, warmth / 2, bh),
    foreground: oklch(0.15, warmth, bh),
    card: oklch(1, 0, 0),
    "card-foreground": oklch(0.15, warmth, bh),
    popover: oklch(1, 0, 0),
    "popover-foreground": oklch(0.15, warmth, bh),
    muted: oklch(0.96, warmth, bh),
    "muted-foreground": oklch(0.46, warmth * 2.5, bh),
    accent: oklch(0.95, warmth * 1.25, bh),
    "accent-foreground": oklch(0.15, warmth, bh),
    secondary: oklch(0.955, warmth, bh),
    "secondary-foreground": oklch(0.2, warmth, bh),
    primary: oklch(brand.l, brand.c, brand.h),
    "primary-foreground": oklch(1, 0, 0),
    destructive: oklch(0.55, 0.22, 25),
    border: oklch(0.91, warmth, bh),
    input: oklch(0.91, warmth, bh),
    ring: oklch(brand.l, brand.c, brand.h),
    "sidebar-primary": oklch(brand.l, brand.c, brand.h),
    "status-success": oklch(0.52, 0.14, 162),
    "status-warning": oklch(0.6, 0.15, 70),
    "status-error": oklch(0.52, 0.19, 25),
    "status-info": oklch(0.5, 0.16, 250),
    "status-progress": oklch(0.5, 0.16, 290),
    "status-neutral": oklch(0.46, warmth * 2.5, bh),
    "accent-blue": oklch(0.5, 0.16, 250),
    "accent-purple": oklch(0.5, 0.16, 300),
    "accent-emerald": oklch(0.5, 0.13, 162),
    "accent-cyan": oklch(0.5, 0.11, 220),
    "accent-violet": oklch(0.5, 0.16, 290),
    "accent-amber": oklch(0.58, 0.14, 70),
    "accent-teal": oklch(0.5, 0.11, 195),
    "accent-orange": oklch(0.56, 0.14, 45),
    "accent-pink": oklch(0.52, 0.16, 350),
    "accent-slate": oklch(0.44, 0.01, 260),
    "accent-indigo": oklch(0.48, 0.16, 275),
    "accent-sky": oklch(0.5, 0.13, 235),
  };
}

export function deriveDarkTokens(
  brand: OklchColor,
  warmth: number,
): ThemeTokens {
  const bh = 75;
  const darkBrand = { l: Math.min(brand.l + 0.1, 0.85), c: brand.c * 0.96, h: brand.h };
  return {
    background: oklch(0.13, warmth * 1.25, bh),
    foreground: oklch(0.93, warmth * 0.75, bh),
    card: oklch(0.16, warmth * 1.25, bh),
    "card-foreground": oklch(0.93, warmth * 0.75, bh),
    popover: oklch(0.18, warmth * 1.25, bh),
    "popover-foreground": oklch(0.93, warmth * 0.75, bh),
    muted: oklch(0.19, warmth * 1.25, bh),
    "muted-foreground": oklch(0.6, warmth * 2, bh),
    accent: oklch(0.21, warmth * 1.5, bh),
    "accent-foreground": oklch(0.93, warmth * 0.75, bh),
    secondary: oklch(0.2, warmth * 1.25, bh),
    "secondary-foreground": oklch(0.9, warmth * 0.75, bh),
    primary: oklch(darkBrand.l, darkBrand.c, darkBrand.h),
    "primary-foreground": oklch(0.13, warmth * 1.25, bh),
    destructive: oklch(0.65, 0.2, 25),
    border: oklchAlpha(1, 0, 0, "10%"),
    input: oklchAlpha(1, 0, 0, "10%"),
    ring: oklch(darkBrand.l, darkBrand.c, darkBrand.h),
    "sidebar-primary": oklch(darkBrand.l, darkBrand.c, darkBrand.h),
    "status-success": oklch(0.68, 0.15, 162),
    "status-warning": oklch(0.74, 0.15, 70),
    "status-error": oklch(0.66, 0.18, 25),
    "status-info": oklch(0.65, 0.15, 250),
    "status-progress": oklch(0.65, 0.15, 290),
    "status-neutral": oklch(0.58, warmth * 2, bh),
    "accent-blue": oklch(0.67, 0.14, 250),
    "accent-purple": oklch(0.68, 0.14, 300),
    "accent-emerald": oklch(0.67, 0.13, 162),
    "accent-cyan": oklch(0.68, 0.1, 220),
    "accent-violet": oklch(0.67, 0.14, 290),
    "accent-amber": oklch(0.74, 0.14, 70),
    "accent-teal": oklch(0.67, 0.1, 195),
    "accent-orange": oklch(0.7, 0.13, 45),
    "accent-pink": oklch(0.68, 0.14, 350),
    "accent-slate": oklch(0.58, 0.01, 260),
    "accent-indigo": oklch(0.65, 0.14, 275),
    "accent-sky": oklch(0.68, 0.12, 235),
  };
}

export function buildCssOverrides(
  tokens: Partial<ThemeTokens>,
): string {
  return Object.entries(tokens)
    .map(([key, value]) => `--${key}: ${value};`)
    .join("\n  ");
}

export function parseOklch(str: string): OklchColor | null {
  const m = str.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) return null;
  return { l: parseFloat(m[1]), c: parseFloat(m[2]), h: parseFloat(m[3]) };
}

export function formatOklch(color: OklchColor): string {
  return oklch(color.l, color.c, color.h);
}

export function oklchToHex(color: OklchColor): string {
  const { l, c, h } = color;
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  let L = l;
  let A = a;
  let B = b;

  let l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  let m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  let s_ = L - 0.0894841775 * A - 1.2914855480 * B;

  l_ = l_ * l_ * l_;
  m_ = m_ * m_ * m_;
  s_ = s_ * s_ * s_;

  let r = +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  let g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  let bv = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_;

  r = Math.max(0, Math.min(1, r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - 0.055));
  g = Math.max(0, Math.min(1, g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1 / 2.4) - 0.055));
  bv = Math.max(0, Math.min(1, bv <= 0.0031308 ? 12.92 * bv : 1.055 * Math.pow(bv, 1 / 2.4) - 0.055));

  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(bv)}`;
}

export function hexToOklch(hex: string): OklchColor {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);

  let l_ = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  let m_ = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  let s_ = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;

  return {
    l: Math.round(L * 1000) / 1000,
    c: Math.round(C * 1000) / 1000,
    h: Math.round(H * 10) / 10,
  };
}
