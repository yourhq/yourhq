"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, FileJson, ClipboardPaste, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParseResult } from "@/lib/import/parse";
import { parseFile, parseText } from "@/lib/import/parse";

type InputMode = "file" | "paste";

interface UploadStepProps {
  onParsed: (result: ParseResult, fileName: string) => void;
}

export function UploadStep({ onParsed }: UploadStepProps) {
  const [mode, setMode] = useState<InputMode>("file");
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<{
    result: ParseResult;
    name: string;
  } | null>(null);
  const [pasteValue, setPasteValue] = useState("");
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setParsing(true);
      try {
        const result = await parseFile(file);
        if (result.rowCount === 0) {
          setError("File contains no data rows.");
          setParsing(false);
          return;
        }
        setParsed({ result, name: file.name });
        onParsed(result, file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse file");
      } finally {
        setParsing(false);
      }
    },
    [onParsed]
  );

  const handlePaste = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setError("Paste some CSV or JSON data first.");
        return;
      }
      setError(null);
      setParsing(true);
      try {
        const result = parseText(trimmed);
        if (result.rowCount === 0) {
          setError("No data rows found in pasted text.");
          setParsing(false);
          return;
        }
        const name = `pasted-data.${result.format}`;
        setParsed({ result, name });
        onParsed(result, name);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to parse pasted data"
        );
      } finally {
        setParsing(false);
      }
    },
    [onParsed]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      dragCounter.current = 0;

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "csv" && ext !== "json") {
        setError("Only CSV and JSON files are supported.");
        return;
      }
      handleFile(file);
    },
    [handleFile]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  function switchMode(next: InputMode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setParsed(null);
    setPasteValue("");
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 rounded-md bg-muted/40 p-0.5 self-center">
        <button
          type="button"
          onClick={() => switchMode("file")}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium transition-colors",
            mode === "file"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Upload className="h-3.5 w-3.5" />
          File
        </button>
        <button
          type="button"
          onClick={() => switchMode("paste")}
          className={cn(
            "flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium transition-colors",
            mode === "paste"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          Paste
        </button>
      </div>

      {mode === "file" ? (
        /* ── File upload zone ── */
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 transition-colors",
            dragActive
              ? "border-primary/60 bg-primary/5"
              : "border-border/60 hover:border-border hover:bg-accent/30",
            parsed && "border-primary/40 bg-primary/5"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json"
            onChange={handleInputChange}
            className="hidden"
          />

          {parsing ? (
            <>
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
              <p className="text-[13px] text-muted-foreground">
                Parsing file...
              </p>
            </>
          ) : parsed ? (
            <>
              {parsed.result.format === "csv" ? (
                <FileText className="h-10 w-10 text-primary/70" />
              ) : (
                <FileJson className="h-10 w-10 text-primary/70" />
              )}
              <div className="text-center">
                <p className="text-[13px] font-medium">{parsed.name}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium uppercase">
                      {parsed.result.format}
                    </span>
                    <span>
                      {parsed.result.rowCount.toLocaleString()} rows
                    </span>
                    <span className="text-border">&middot;</span>
                    <span>{parsed.result.headers.length} columns</span>
                  </span>
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Click or drop to replace
              </p>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground/50" />
              <div className="text-center">
                <p className="text-[13px] text-foreground">
                  Drop a CSV or JSON file here
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  or click to browse
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── Paste mode ── */
        <div className="flex flex-col gap-3">
          {parsed ? (
            <div
              className="flex w-full flex-col items-center gap-3 rounded-lg border-2 border-primary/40 bg-primary/5 px-6 py-8"
            >
              {parsed.result.format === "csv" ? (
                <FileText className="h-10 w-10 text-primary/70" />
              ) : (
                <FileJson className="h-10 w-10 text-primary/70" />
              )}
              <div className="text-center">
                <p className="text-[13px] font-medium">Pasted data</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium uppercase">
                      {parsed.result.format}
                    </span>
                    <span>
                      {parsed.result.rowCount.toLocaleString()} rows
                    </span>
                    <span className="text-border">&middot;</span>
                    <span>{parsed.result.headers.length} columns</span>
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setParsed(null);
                  setPasteValue("");
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Clear and paste again
              </button>
            </div>
          ) : (
            <>
              <textarea
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                onPaste={(e) => {
                  // Auto-parse on paste if the textarea was empty
                  const text = e.clipboardData.getData("text");
                  if (!pasteValue.trim() && text.trim()) {
                    e.preventDefault();
                    setPasteValue(text);
                    handlePaste(text);
                  }
                }}
                placeholder={"Paste CSV or JSON data here...\n\nname,email,phone\nJohn Doe,john@example.com,555-1234"}
                className="min-h-[200px] w-full resize-none rounded-lg border border-border/60 bg-muted/10 px-4 py-3 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
              />
              {pasteValue.trim() && !parsed && (
                <button
                  type="button"
                  onClick={() => handlePaste(pasteValue)}
                  className="self-end rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Parse data
                </button>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Supports CSV (Airtable, Google Sheets exports) and JSON (array of
        objects)
      </p>
    </div>
  );
}
