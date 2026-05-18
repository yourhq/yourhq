import type { Context, Next } from "hono";

interface Window {
  timestamps: number[];
}

const buckets = new Map<string, Window>();

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, win] of buckets) {
    win.timestamps = win.timestamps.filter((t) => now - t < 3600_000);
    if (win.timestamps.length === 0) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  let win = buckets.get(key);
  if (!win) {
    win = { timestamps: [] };
    buckets.set(key, win);
  }
  win.timestamps = win.timestamps.filter((t) => now - t < windowMs);
  if (win.timestamps.length >= maxRequests) return true;
  win.timestamps.push(now);
  return false;
}

export function rateLimit(opts: {
  keyFn: (c: Context) => string;
  max: number;
  windowMs: number;
}) {
  return async (c: Context, next: Next) => {
    const key = opts.keyFn(c);
    if (isRateLimited(key, opts.max, opts.windowMs)) {
      return c.json({ error: "Too many requests" }, 429);
    }
    await next();
  };
}
