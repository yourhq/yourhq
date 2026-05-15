"use client";

import { CheckCircle2, XCircle, AlertTriangle, FileDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ImportResult } from "@/lib/import/types";

interface ImportStepProps {
  importing: boolean;
  progress: number; // 0-100
  completed: number;
  total: number;
  result: ImportResult | null;
}

export function ImportStep({
  importing,
  progress,
  completed,
  total,
  result,
}: ImportStepProps) {
  if (importing) {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="flex flex-col items-center gap-2">
          <FileDown className="h-10 w-10 animate-pulse text-primary/70" />
          <p className="text-[13px] font-medium">Importing...</p>
          <p className="tabular-nums text-[12px] text-muted-foreground">
            {completed} / {total} rows
          </p>
        </div>
        <div className="w-full max-w-sm">
          <Progress value={progress} />
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="flex flex-col gap-4 py-4">
      {/* Summary card */}
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
        <div className="mb-3 flex items-center gap-2">
          {result.errored === 0 ? (
            <CheckCircle2 className="h-5 w-5 text-status-success" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-status-warning" />
          )}
          <h3 className="text-[14px] font-medium">Import complete</h3>
        </div>

        <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-[13px] sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Created</p>
            <p className="font-medium text-status-success">{result.created}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Skipped</p>
            <p className="font-medium">{result.skipped}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Duplicates</p>
            <p className="font-medium">{result.duplicates}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Errors</p>
            <p
              className={cn(
                "font-medium",
                result.errored > 0 && "text-destructive"
              )}
            >
              {result.errored}
            </p>
          </div>
        </div>
      </div>

      {/* Error log */}
      {result.errors.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-medium text-muted-foreground">
            Errors ({result.errors.length})
          </p>
          <div className="max-h-[160px] overflow-y-auto rounded-md border border-border/60 bg-muted/10">
            {result.errors.map((err, i) => (
              <div
                key={i}
                className="flex items-start gap-2 border-b border-border/40 px-3 py-2 text-[12px] last:border-b-0"
              >
                <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                <span>
                  <span className="font-mono text-muted-foreground">
                    Row {err.row}:
                  </span>{" "}
                  {err.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
