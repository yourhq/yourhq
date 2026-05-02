"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { CollectionField, CollectionRecord } from "@/lib/collections/types";
import { FIELD_TYPE_LABELS } from "@/lib/collections/types";
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
        <p className="text-body text-muted-foreground">
          Created {formatDistanceToNow(new Date(record.created_at), { addSuffix: true })}
        </p>
      </div>

      {/* Fields */}
      <div className="space-y-3">
        {activeFields.filter((f) => !f.is_title_field).map((field) => (
          <div key={field.id} className="grid grid-cols-[120px_1fr] items-start gap-2">
            <div className="flex flex-col py-1">
              <span className="text-body text-muted-foreground truncate">{field.label}</span>
              <span className="text-[10px] text-muted-foreground/60 uppercase">
                {FIELD_TYPE_LABELS[field.field_type]}
              </span>
            </div>
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
