"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { CollectionField, CollectionRecord } from "@/lib/collections/types";
import { CollectionCell } from "./collection-cell";
import { formatDistanceToNow } from "date-fns";

interface CollectionRecordDetailProps {
  record: CollectionRecord;
  fields: CollectionField[];
  onCellChange: (fieldKey: string, value: unknown) => void;
}

export function CollectionRecordDetail({
  record,
  fields,
  onCellChange,
}: CollectionRecordDetailProps) {
  const activeFields = useMemo(
    () => fields.filter((f) => f.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [fields],
  );

  const titleField = activeFields.find((f) => f.is_title_field);
  const titleValue = titleField
    ? (record.values[titleField.field_key] as string) ?? ""
    : "";
  const [titleDraft, setTitleDraft] = useState(titleValue);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleDraft(titleValue);
  }, [titleValue]);

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (titleField && trimmed !== titleValue) {
      onCellChange(titleField.field_key, trimmed);
    }
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <input
          ref={titleRef}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
              titleRef.current?.blur();
            }
          }}
          placeholder="Untitled"
          className="w-full bg-transparent text-lg font-semibold text-foreground placeholder:text-muted-foreground/50 outline-none border-none focus:ring-0"
        />
        <div className="flex items-center gap-3 text-body text-muted-foreground">
          <span>
            Created {formatDistanceToNow(new Date(record.created_at), { addSuffix: true })}
          </span>
          {record.updated_at !== record.created_at && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>
                Updated {formatDistanceToNow(new Date(record.updated_at), { addSuffix: true })}
              </span>
            </>
          )}
          {record.archived_at && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-amber-500">Archived</span>
            </>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-1">
        {activeFields.filter((f) => !f.is_title_field).map((field) => (
          <div
            key={field.id}
            className="grid grid-cols-1 sm:grid-cols-[160px_1fr] items-start gap-1 sm:gap-3 rounded-md px-1 py-1.5 hover:bg-accent/30 transition-colors"
          >
            <span className="text-body text-muted-foreground truncate py-1">
              {field.label}
              {field.required && <span className="text-destructive ml-0.5">*</span>}
            </span>
            <div className="min-w-0">
              <CollectionCell
                field={field}
                value={record.values[field.field_key]}
                onChange={(value) => onCellChange(field.field_key, value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
