"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  type?: "text" | "textarea";
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function InlineEdit({
  value,
  onSave,
  type = "text",
  placeholder = "Click to edit...",
  className,
  inputClassName,
}: InlineEditProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function save() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) {
      onSave(trimmed);
    }
  }

  function cancel() {
    setEditing(false);
    setDraft(value);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      cancel();
    } else if (e.key === "Enter" && type === "text") {
      save();
    } else if (e.key === "Enter" && e.metaKey && type === "textarea") {
      save();
    }
  }

  if (editing) {
    const sharedClasses = cn(
      "w-full rounded-sm border border-ring bg-transparent px-1.5 py-1 text-sm outline-none",
      inputClassName
    );

    if (type === "textarea") {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          rows={3}
          className={cn(sharedClasses, "resize-y")}
        />
      );
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className={sharedClasses}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        "cursor-pointer rounded-sm px-1.5 py-1 text-sm hover:bg-accent",
        !value && "text-muted-foreground italic",
        className
      )}
    >
      {value || placeholder}
    </span>
  );
}
