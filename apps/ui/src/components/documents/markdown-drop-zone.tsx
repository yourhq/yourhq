"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";

interface MarkdownDropZoneProps {
  onImport: (files: File[]) => Promise<void>;
  disabled?: boolean;
  children: React.ReactNode;
}

export function MarkdownDropZone({
  onImport,
  disabled,
  children,
}: MarkdownDropZoneProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      dragCounter.current++;
      setIsDraggingOver(true);
    },
    [disabled]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDraggingOver(false);
      if (disabled) return;

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        /\.(md|markdown)$/i.test(f.name)
      );
      if (files.length > 0) {
        onImport(files);
      }
    },
    [disabled, onImport]
  );

  return (
    <div
      className="relative flex flex-1 min-h-0"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/40 bg-background/80 backdrop-blur-sm transition-all">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <Upload className="h-7 w-7 text-primary/70" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Drop .md files to import
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Files will be converted and added as documents
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
