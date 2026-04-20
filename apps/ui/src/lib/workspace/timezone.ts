// Timezone utilities for recurring tasks.
// Uses Intl.DateTimeFormat — no extra dependency.

import { createClient } from "@/lib/supabase/client";

/** The user's current browser timezone (fallback when workspace has none set). */
export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Fetch the workspace's owner_timezone (falls back to browser tz). */
export async function getWorkspaceTimezone(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase
    .from("workspace")
    .select("owner_timezone")
    .limit(1)
    .maybeSingle();
  return data?.owner_timezone || browserTimezone();
}

/** Format a UTC ISO timestamp into a human string in a specific tz. */
export function formatInTimezone(
  utcIso: string,
  tz: string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }
): string {
  const d = new Date(utcIso);
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: tz }).format(d);
}

/**
 * Convert a local wall-clock (YYYY-MM-DD, HH:MM[:SS]) in `tz` to UTC ISO.
 * Uses iterative offset correction to handle DST correctly.
 */
export function localWallToUtcIso(
  dateStr: string,
  timeStr: string,
  tz: string
): string {
  const [hh = "0", mm = "0", ss = "0"] = timeStr.split(":");
  const [y, m, d] = dateStr.split("-").map(Number);
  // First pass: treat the wall time as if it were UTC, then adjust.
  let guess = new Date(
    Date.UTC(y, (m || 1) - 1, d || 1, Number(hh), Number(mm), Number(ss))
  );
  // Find what wall time this instant presents in the target tz.
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(guess);
    const lookup = (t: string) =>
      Number(parts.find((p) => p.type === t)?.value || 0);
    const asUtcOfWall = Date.UTC(
      lookup("year"),
      lookup("month") - 1,
      lookup("day"),
      lookup("hour") === 24 ? 0 : lookup("hour"),
      lookup("minute"),
      lookup("second")
    );
    const target = Date.UTC(
      y,
      (m || 1) - 1,
      d || 1,
      Number(hh),
      Number(mm),
      Number(ss)
    );
    const diff = target - asUtcOfWall;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess.toISOString();
}

/** Format a time value (HH:MM[:SS]) into "8:00 AM" style. */
export function formatTimeOfDay(timeStr: string): string {
  const [hh = "0", mm = "0"] = timeStr.split(":");
  const h = Number(hh);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm.padStart(2, "0")} ${suffix}`;
}
