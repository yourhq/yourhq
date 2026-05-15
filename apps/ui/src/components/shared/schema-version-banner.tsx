"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getSchemaVersionAction } from "@/app/dashboard/actions";

export function SchemaVersionBanner() {
  const [state, setState] = useState<{
    current: number | null;
    expected: number;
  } | null>(null);

  useEffect(() => {
    getSchemaVersionAction().then(setState).catch(() => {});
  }, []);

  if (!state) return null;
  if (state.current !== null && state.current >= state.expected) return null;

  return (
    <div className="flex items-center gap-2 border-b border-status-warning/20 bg-status-warning/10 px-4 py-2 text-xs text-status-warning">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>
        Schema update available
        {state.current !== null && (
          <> &mdash; running v{state.current}, latest is v{state.expected}</>
        )}
        {state.current === null && (
          <> &mdash; schema version table not found, run migrations through v{state.expected}</>
        )}
        . Apply pending migrations from <code className="rounded bg-status-warning/20 px-1 py-0.5 font-mono">db/migrations/</code>.
      </span>
    </div>
  );
}
