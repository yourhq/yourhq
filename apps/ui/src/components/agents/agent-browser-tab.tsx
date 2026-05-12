"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Globe,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { BrowserState, BrowserTab } from "@/lib/agent-repo/browser-types";

interface AgentBrowserTabProps {
  slug: string;
}

const POLL_INTERVAL_MS = 800;
const MAX_CONSECUTIVE_ERRORS = 3;

export function AgentBrowserTab({ slug }: AgentBrowserTabProps) {
  const [state, setState] = useState<BrowserState | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorCountRef = useRef(0);
  const prevBlobRef = useRef<string | null>(null);
  const visibleRef = useRef(true);
  const mountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchFrame = useCallback(async () => {
    if (!visibleRef.current || !mountedRef.current) return;
    try {
      const [stateRes, imgRes] = await Promise.all([
        fetch(`/api/agents/${slug}/browser/state`),
        fetch(`/api/agents/${slug}/browser/screenshot`),
      ]);

      if (!mountedRef.current) return;

      if (!stateRes.ok || !imgRes.ok) {
        const failedRes = !stateRes.ok ? stateRes : imgRes;
        let msg = `Gateway returned ${failedRes.status}`;
        try {
          const body = await failedRes.json();
          if (body.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      const browserState: BrowserState = await stateRes.json();
      const blob = await imgRes.blob();
      const url = URL.createObjectURL(blob);

      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
      }
      prevBlobRef.current = url;

      setState(browserState);
      setScreenshotUrl(url);
      setError(null);
      setLoading(false);
      errorCountRef.current = 0;
    } catch (e) {
      errorCountRef.current += 1;
      if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setError(e instanceof Error ? e.message : "Connection lost");
        setLoading(false);
        stopPolling();
      }
    }
  }, [slug, stopPolling]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return;
    errorCountRef.current = 0;
    intervalRef.current = setInterval(fetchFrame, POLL_INTERVAL_MS);
  }, [fetchFrame]);

  const handleRefresh = useCallback(() => {
    setError(null);
    setLoading(true);
    errorCountRef.current = 0;
    fetchFrame();
    if (!paused) startPolling();
  }, [fetchFrame, paused, startPolling]);

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      if (prev) {
        startPolling();
      } else {
        stopPolling();
      }
      return !prev;
    });
  }, [startPolling, stopPolling]);

  useEffect(() => {
    mountedRef.current = true;
    fetchFrame();
    startPolling();
    return () => {
      mountedRef.current = false;
      stopPolling();
      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
      }
    };
  }, [fetchFrame, startPolling, stopPolling]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        visibleRef.current = false;
        stopPolling();
      } else {
        visibleRef.current = true;
        if (!paused && !error) startPolling();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [paused, error, startPolling, stopPolling]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const currentUrl = state?.url ?? null;
  const tabs = state?.tabs ?? [];
  const isStreaming = !paused && !error && !loading;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden",
        fullscreen
          ? "fixed inset-0 z-50 bg-background"
          : "h-full"
      )}
    >
      {/* ── Address bar ──────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border/60 px-3">
        {/* Live indicator */}
        <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          {isStreaming && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </div>

        {/* URL display */}
        <div className="min-w-0 flex-1 rounded-md bg-muted/50 px-2.5 py-1">
          {currentUrl ? (
            <span className="block truncate text-[11px] font-mono text-foreground/80">
              {currentUrl}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground/60">
              {loading ? "Connecting…" : "No page loaded"}
            </span>
          )}
        </div>

        {/* Tab count */}
        {tabs.length > 1 && (
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {tabs.length}
          </span>
        )}

        {/* Controls */}
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleRefresh}
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={togglePause}
            title={paused ? "Resume streaming" : "Pause streaming"}
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* ── Tab strip (shown when multiple tabs open) ────────── */}
      {tabs.length > 1 && (
        <div className="flex h-7 shrink-0 items-center gap-px overflow-x-auto border-b border-border/40 bg-muted/30 px-2">
          {tabs.map((tab: BrowserTab) => (
            <div
              key={tab.id}
              className={cn(
                "flex max-w-[180px] items-center gap-1 rounded-sm px-2 py-0.5 text-[10px]",
                tab.url === currentUrl
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              <span className="truncate">{tab.title || tab.url}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Viewport ─────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="rounded-full bg-muted/50 p-3">
              <Globe className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <div className="max-w-xs space-y-1">
              <p className="text-[13px] font-medium text-foreground">{error}</p>
              <p className="text-[11px] text-muted-foreground">
                The agent&apos;s browser may not be running yet, or the gateway
                is unreachable. Check Settings → Gateways if this persists.
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={handleRefresh}>
              <RefreshCw className="mr-1.5 h-3 w-3" />
              Retry
            </Button>
          </div>
        ) : loading && !screenshotUrl ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground">
                Connecting to browser…
              </p>
            </div>
          </div>
        ) : screenshotUrl ? (
          <div className="flex h-full items-center justify-center bg-neutral-950/[0.02] p-3 dark:bg-neutral-950/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshotUrl}
              alt="Agent browser"
              className="max-h-full max-w-full rounded-md border border-border/50 object-contain shadow-md"
              draggable={false}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <p className="text-[12px] text-muted-foreground">
              No screenshot available
            </p>
          </div>
        )}

        {/* Paused overlay badge */}
        {paused && screenshotUrl && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 shadow-sm ring-1 ring-border/50 backdrop-blur-sm">
            <Pause className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Paused</span>
          </div>
        )}
      </div>
    </div>
  );
}
