const loopStatus = new Map<string, { lastRunAt: string; ok: boolean; error?: string }>();

export function reportLoopRun(name: string, ok: boolean, error?: string): void {
  loopStatus.set(name, {
    lastRunAt: new Date().toISOString(),
    ok,
    error: error?.slice(0, 200),
  });
}

export function getLoopStatuses(): Record<string, { lastRunAt: string; ok: boolean; error?: string }> {
  return Object.fromEntries(loopStatus);
}
