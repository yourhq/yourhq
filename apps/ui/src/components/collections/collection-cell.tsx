"use client";

import { useState, useRef, useEffect } from "react";
import type { CollectionField, SelectOption } from "@/lib/collections/types";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

interface CollectionCellProps {
  field: CollectionField;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
}

export function CollectionCell({ field, value, onChange, readOnly }: CollectionCellProps) {
  switch (field.field_type) {
    case "text":
    case "email":
    case "phone":
      return <TextCell value={value as string} onChange={onChange} readOnly={readOnly} />;
    case "number":
      return <NumberCell value={value as number} onChange={onChange} readOnly={readOnly} />;
    case "url":
      return <UrlCell value={value as string} onChange={onChange} readOnly={readOnly} />;
    case "date":
    case "datetime":
      return (
        <DateCell
          value={value as string}
          onChange={onChange}
          readOnly={readOnly}
          includeTime={field.field_type === "datetime"}
        />
      );
    case "boolean":
      return <BooleanCell value={value as boolean} onChange={onChange} readOnly={readOnly} />;
    case "select":
      return (
        <SelectCell
          value={value as string}
          onChange={onChange}
          options={field.options?.choices ?? []}
          readOnly={readOnly}
        />
      );
    case "multi_select":
      return (
        <MultiSelectCell
          value={(value as string[]) ?? []}
          onChange={onChange}
          options={field.options?.choices ?? []}
          readOnly={readOnly}
        />
      );
    case "rich_text":
      return <TextCell value={value as string} onChange={onChange} readOnly={readOnly} />;
    case "relation":
      return <TextCell value={value as string} onChange={onChange} readOnly={readOnly} />;
    default:
      return <span className="text-body text-muted-foreground">—</span>;
  }
}

function TextCell({
  value,
  onChange,
  readOnly,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function startEditing() {
    setDraft(value ?? "");
    setEditing(true);
  }

  if (readOnly || !editing) {
    return (
      <button
        type="button"
        className="w-full text-left text-body truncate px-1.5 py-0.5 rounded hover:bg-accent/50 min-h-[28px] flex items-center"
        onClick={() => !readOnly && startEditing()}
      >
        {value || <span className="text-muted-foreground/50">{readOnly ? "—" : "Empty"}</span>}
      </button>
    );
  }

  return (
    <Input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== (value ?? "")) onChange(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          if (draft !== (value ?? "")) onChange(draft);
        }
        if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      className="h-7 text-body"
    />
  );
}

function NumberCell({
  value,
  onChange,
  readOnly,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function startEditing() {
    setDraft(value?.toString() ?? "");
    setEditing(true);
  }

  if (readOnly || !editing) {
    return (
      <button
        type="button"
        className="w-full text-left text-body truncate px-1.5 py-0.5 rounded hover:bg-accent/50 min-h-[28px] flex items-center tabular-nums"
        onClick={() => !readOnly && startEditing()}
      >
        {value !== null && value !== undefined ? value : <span className="text-muted-foreground/50">{readOnly ? "—" : "Empty"}</span>}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const num = draft === "" ? null : Number(draft);
    if (num !== value) onChange(num);
  };

  return (
    <Input
      ref={ref}
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      className="h-7 text-body tabular-nums"
    />
  );
}

function UrlCell({
  value,
  onChange,
  readOnly,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function startEditing() {
    setDraft(value ?? "");
    setEditing(true);
  }

  if (readOnly || !editing) {
    return (
      <button
        type="button"
        className="w-full text-left text-body truncate px-1.5 py-0.5 rounded hover:bg-accent/50 min-h-[28px] flex items-center gap-1"
        onClick={() => !readOnly && startEditing()}
      >
        {value ? (
          <>
            <span className="truncate text-blue-400">{value}</span>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </>
        ) : (
          <span className="text-muted-foreground/50">{readOnly ? "—" : "Empty"}</span>
        )}
      </button>
    );
  }

  return (
    <Input
      ref={ref}
      type="url"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== (value ?? "")) onChange(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          if (draft !== (value ?? "")) onChange(draft);
        }
        if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      className="h-7 text-body"
      placeholder="https://..."
    />
  );
}

function DateCell({
  value,
  onChange,
  readOnly,
  includeTime,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  readOnly?: boolean;
  includeTime?: boolean;
}) {
  const inputType = includeTime ? "datetime-local" : "date";

  if (readOnly) {
    return (
      <span className="text-body px-1.5">
        {value ? new Date(value).toLocaleDateString() : "—"}
      </span>
    );
  }

  return (
    <Input
      type={inputType}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-7 text-body w-auto"
    />
  );
}

function BooleanCell({
  value,
  onChange,
  readOnly,
}: {
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center justify-center">
      <Checkbox
        checked={!!value}
        onCheckedChange={(checked) => onChange(!!checked)}
        disabled={readOnly}
      />
    </div>
  );
}

function SelectCell({
  value,
  onChange,
  options,
  readOnly,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  options: SelectOption[];
  readOnly?: boolean;
}) {
  if (readOnly) {
    const opt = options.find((o) => o.value === value);
    if (!opt) return <span className="text-body text-muted-foreground px-1.5">—</span>;
    return (
      <Badge
        variant="outline"
        className="text-[11px]"
        style={opt.color ? { borderColor: opt.color, color: opt.color } : undefined}
      >
        {opt.label}
      </Badge>
    );
  }

  const selectedOpt = options.find((o) => o.value === value);

  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
    >
      <SelectTrigger className="h-7 text-body border-0 bg-transparent hover:bg-accent/50 px-1.5 [&>svg]:text-muted-foreground/40">
        {selectedOpt ? (
          <span className="flex items-center gap-1.5">
            {selectedOpt.color && (
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: selectedOpt.color }}
              />
            )}
            <span className="truncate">{selectedOpt.label}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/50">Select...</span>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">
          <span className="text-muted-foreground">None</span>
        </SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <span className="flex items-center gap-1.5">
              {opt.color && (
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: opt.color }}
                />
              )}
              {opt.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiSelectCell({
  value,
  onChange,
  options,
  readOnly,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: SelectOption[];
  readOnly?: boolean;
}) {
  const toggle = (val: string) => {
    if (readOnly) return;
    const next = value.includes(val)
      ? value.filter((v) => v !== val)
      : [...value, val];
    onChange(next);
  };

  const remaining = options.filter((o) => !value.includes(o.value));

  return (
    <div className="flex flex-wrap gap-1 px-1 py-0.5 min-h-[28px] items-center">
      {value.map((v) => {
        const opt = options.find((o) => o.value === v);
        return (
          <Badge
            key={v}
            variant="outline"
            className={cn("text-[10px] cursor-pointer", !readOnly && "hover:line-through")}
            style={opt?.color ? { borderColor: opt.color, color: opt.color } : undefined}
            onClick={() => toggle(v)}
          >
            {opt?.label ?? v}
          </Badge>
        );
      })}
      {!readOnly && remaining.length > 0 && (
        <Select
          value=""
          onValueChange={(val) => {
            if (!value.includes(val)) onChange([...value, val]);
          }}
        >
          <SelectTrigger className="h-5 border-0 bg-transparent px-1 text-muted-foreground/50 hover:text-muted-foreground [&>svg]:hidden">
            <span className="text-[11px]">{value.length === 0 ? "Select..." : "+"}</span>
          </SelectTrigger>
          <SelectContent>
            {remaining.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="flex items-center gap-1.5">
                  {opt.color && (
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                  )}
                  {opt.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
