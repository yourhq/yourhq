"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineCreateRowProps {
  placeholder: string;
  onSubmit: (value: string) => void;
  className?: string;
  /** Extra fields rendered inline after the text input */
  children?: React.ReactNode;
}

export function InlineCreateRow({
  placeholder,
  onSubmit,
  className,
  children,
}: InlineCreateRowProps) {
  const [value, setValue] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setValue("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      setValue("");
      inputRef.current?.blur();
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-dashed border-border/50 px-3 py-2 transition-colors",
        focused && "border-border bg-accent/30",
        className
      )}
    >
      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {focused && children}
    </div>
  );
}
