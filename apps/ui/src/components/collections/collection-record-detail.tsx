"use client";

import { useMemo } from "react";
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
  const title = titleField
    ? (record.values[titleField.field_key] as string) || "Untitled"
    : "Untitled";

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-body text-muted-foreground">
          Created {formatDistanceToNow(new Date(record.created_at), { addSuffix: true })}
        </p>
      </div>

      {/* Fields */}
      <div className="space-y-3">
        {activeFields.map((field) => (
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
