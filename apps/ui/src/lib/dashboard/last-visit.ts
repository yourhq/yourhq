const STORAGE_KEY = "hq_last_dashboard_visit";
const BRIEFING_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

export function getLastDashboardVisit(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setLastDashboardVisit(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, new Date().toISOString());
}

export function shouldShowBriefing(): boolean {
  const last = getLastDashboardVisit();
  if (!last) return false;
  const gap = Date.now() - new Date(last).getTime();
  return gap >= BRIEFING_THRESHOLD_MS;
}
