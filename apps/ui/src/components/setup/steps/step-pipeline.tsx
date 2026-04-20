"use client";

import { PIPELINE_TEMPLATES } from "@/lib/setup/templates";
import { cn } from "@/lib/utils";

interface Props {
  selectedKey: string;
  onSelect: (key: string) => void;
}

export function StepPipeline({ selectedKey, onSelect }: Props) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[15px] font-semibold text-foreground">
          Define your pipeline
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Choose a template for your contact stages. You can customize these later in settings.
        </p>
      </div>

      <div className="space-y-1">
        {PIPELINE_TEMPLATES.map((template) => {
          const isSelected = selectedKey === template.key;
          return (
            <button
              key={template.key}
              type="button"
              onClick={() => onSelect(template.key)}
              className={cn(
                "flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors outline-none",
                isSelected
                  ? "border-foreground/30 bg-muted/40"
                  : "border-border/30 hover:bg-muted/20"
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40 text-base">
                {template.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {template.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {template.description}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {template.stages.map((stage, i) => (
                    <div key={stage.stage_key} className="flex items-center gap-1">
                      <span className="flex items-center gap-1 rounded border border-border/30 bg-muted/20 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.label}
                      </span>
                      {i < template.stages.length - 1 && (
                        <span className="text-[10px] text-muted-foreground/30">&rarr;</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
