export default function AgentDetailLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
        <div className="h-4 w-4 rounded bg-muted/40 animate-pulse" />
        <div className="h-4 w-12 rounded bg-muted/40 animate-pulse" />
        <div className="h-8 w-8 rounded bg-muted/40 animate-pulse" />
        <div className="h-5 w-40 rounded bg-muted/40 animate-pulse" />
        <div className="h-4 w-16 rounded bg-muted/40 animate-pulse" />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Main content skeleton */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Tab bar skeleton */}
          <div className="flex gap-4 border-b border-border/60 px-5 py-2">
            {["w-16", "w-14", "w-10", "w-14"].map((w, i) => (
              <div
                key={i}
                className={`h-5 ${w} rounded bg-muted/30 animate-pulse`}
              />
            ))}
          </div>

          {/* Content skeleton */}
          <div className="mx-auto w-full max-w-3xl space-y-5 px-5 py-5">
            <div className="h-20 rounded-xl bg-muted/20 animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-muted/20 animate-pulse" />
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-muted/20 animate-pulse" />
              <div className="h-12 rounded-lg bg-muted/20 animate-pulse" />
              <div className="h-12 rounded-lg bg-muted/20 animate-pulse" />
            </div>
          </div>
        </main>

        {/* Sidebar skeleton */}
        <div className="hidden w-[280px] shrink-0 border-l border-border/60 lg:block">
          <div className="space-y-5 p-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 rounded bg-muted/30 animate-pulse" />
                <div className="h-6 w-full rounded bg-muted/20 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
