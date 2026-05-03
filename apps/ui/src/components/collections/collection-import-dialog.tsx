"use client";

import { useState, useCallback } from "react";
import type { CollectionField } from "@/lib/collections/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet } from "lucide-react";

interface CollectionImportDialogProps {
  open: boolean;
  onClose: () => void;
  fields: CollectionField[];
  onImport: (rows: Record<string, unknown>[]) => Promise<number>;
}

interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

function parseCSV(text: string): ParsedCSV {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parse = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parse(lines[0]);
  const rows = lines.slice(1).map(parse);
  return { headers, rows };
}

export function CollectionImportDialog({
  open,
  onClose,
  fields,
  onImport,
}: CollectionImportDialogProps) {
  const [csv, setCsv] = useState<ParsedCSV | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setCsv(parsed);

      const autoMap: Record<number, string> = {};
      parsed.headers.forEach((h, i) => {
        const key = h.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        const match = fields.find(
          (f) => f.field_key === key || f.label.toLowerCase() === h.toLowerCase(),
        );
        if (match) autoMap[i] = match.field_key;
      });
      setMapping(autoMap);
    };
    reader.readAsText(file);
  }, [fields]);

  const handleImport = async () => {
    if (!csv) return;
    setImporting(true);
    try {
      const rows = csv.rows.map((row) => {
        const values: Record<string, unknown> = {};
        row.forEach((val, i) => {
          const fieldKey = mapping[i];
          if (fieldKey && val !== "") {
            const field = fields.find((f) => f.field_key === fieldKey);
            if (field?.field_type === "number") {
              const num = Number(val);
              values[fieldKey] = isNaN(num) ? val : num;
            } else if (field?.field_type === "boolean") {
              values[fieldKey] = val.toLowerCase() === "true" || val === "1";
            } else {
              values[fieldKey] = val;
            }
          }
        });
        return values;
      });

      await onImport(rows);
      reset();
      onClose();
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setCsv(null);
    setFileName("");
    setMapping({});
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Records</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import records into this collection.
          </DialogDescription>
        </DialogHeader>

        {!csv ? (
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border/60 p-8 transition-colors hover:border-border hover:bg-accent/20">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-heading">Drop CSV file here or click to browse</p>
              <p className="text-body text-muted-foreground">Supports .csv files</p>
            </div>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-body">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span>{fileName}</span>
              <span className="text-muted-foreground">
                ({csv.rows.length} rows, {csv.headers.length} columns)
              </span>
            </div>

            <div className="space-y-2">
              <Label>Column Mapping</Label>
              <div className="max-h-[300px] overflow-y-auto space-y-1.5">
                {csv.headers.map((header, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <span className="text-body truncate">{header}</span>
                    <span className="text-muted-foreground">→</span>
                    <Select
                      value={mapping[i] ?? "__skip__"}
                      onValueChange={(v) => {
                        const next = { ...mapping };
                        if (v === "__skip__") {
                          delete next[i];
                        } else {
                          next[i] = v;
                        }
                        setMapping(next);
                      }}
                    >
                      <SelectTrigger className="h-7 text-body">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">Skip</SelectItem>
                        {fields.map((f) => (
                          <SelectItem key={f.field_key} value={f.field_key}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>
            Cancel
          </Button>
          {csv && (
            <Button onClick={handleImport} disabled={importing || Object.keys(mapping).length === 0}>
              {importing ? "Importing..." : `Import ${csv.rows.length} records`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
