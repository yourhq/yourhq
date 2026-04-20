"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_STREAMS } from "@/lib/setup/templates";

interface StreamItem {
  name: string;
  enabled: boolean;
  isCustom: boolean;
}

interface Props {
  streams: StreamItem[];
  onChange: (streams: StreamItem[]) => void;
}

export function StepStreams({ streams, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [customName, setCustomName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function toggle(index: number) {
    const next = streams.map((s, i) =>
      i === index ? { ...s, enabled: !s.enabled } : s
    );
    onChange(next);
  }

  function removeCustom(index: number) {
    onChange(streams.filter((_, i) => i !== index));
  }

  function addCustom() {
    const trimmed = customName.trim();
    if (!trimmed) return;
    if (streams.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      setCustomName("");
      return;
    }
    onChange([...streams, { name: trimmed, enabled: true, isCustom: true }]);
    setCustomName("");
    setAdding(false);
  }

  function getColor(name: string) {
    const match = DEFAULT_STREAMS.find((s) => s.name === name);
    return match?.color ?? "#6b7280";
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[15px] font-semibold text-foreground">
          Create task streams
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Streams organize your tasks into workstreams. Toggle defaults or add your own.
        </p>
      </div>

      <div className="space-y-1">
        {streams.map((stream, i) => (
          <div
            key={stream.name}
            className={cn(
              "group flex h-10 items-center gap-3 rounded-md border px-3 transition-colors cursor-pointer",
              stream.enabled
                ? "border-foreground/30 bg-muted/40"
                : "border-border/30 hover:bg-muted/20"
            )}
            onClick={() => toggle(i)}
          >
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full transition-opacity",
                !stream.enabled && "opacity-30"
              )}
              style={{ backgroundColor: getColor(stream.name) }}
            />
            <span className={cn(
              "flex-1 text-sm",
              stream.enabled ? "text-foreground font-medium" : "text-muted-foreground"
            )}>
              {stream.name}
            </span>
            {stream.isCustom && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeCustom(i);
                }}
                className="rounded p-0.5 text-muted-foreground/40 opacity-0 transition-all hover:text-foreground group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}

        {adding ? (
          <div className="flex h-10 items-center gap-3 rounded-md border border-dashed border-border/50 px-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30" />
            <input
              ref={inputRef}
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  addCustom();
                }
                if (e.key === "Escape") {
                  setAdding(false);
                  setCustomName("");
                }
              }}
              onBlur={() => {
                if (!customName.trim()) setAdding(false);
              }}
              placeholder="Stream name"
              autoFocus
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="flex h-10 w-full items-center gap-3 rounded-md border border-dashed border-border/30 px-3 text-muted-foreground/50 transition-colors hover:border-border/60 hover:text-muted-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-sm">Add custom stream</span>
          </button>
        )}
      </div>
    </div>
  );
}
