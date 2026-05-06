"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useFieldDefinitions } from "@/hooks/use-field-definitions";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";

import type { ParseResult } from "@/lib/import/parse";
import type {
  ColumnMapping,
  DuplicateStrategy,
  ImportEntityType,
  ImportResult,
  ImportStep as ImportStepType,
  ValidatedRow,
} from "@/lib/import/types";
import { autoDetectMappings } from "@/lib/import/mapping";
import { validateRows } from "@/lib/import/validate";
import { transformRows } from "@/lib/import/transform";
import { countDuplicates, executeImport } from "@/lib/import/execute";

import { UploadStep } from "./upload-step";
import { MappingStep } from "./mapping-step";
import { PreviewStep } from "./preview-step";
import { ImportStep } from "./import-step";

interface ImportWizardProps {
  entityType: ImportEntityType;
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const STEP_ORDER: ImportStepType[] = ["upload", "map", "preview", "import"];
const STEP_LABELS: Record<ImportStepType, string> = {
  upload: "Upload",
  map: "Map columns",
  preview: "Preview",
  import: "Import",
};

export function ImportWizard({
  entityType,
  open,
  onClose,
  onComplete,
}: ImportWizardProps) {
  const supabase = useMemo(() => createClient(), []);
  const { fields: fieldDefinitions } = useFieldDefinitions(entityType);
  const { stages, defaultStage } = usePipelineStages(entityType);

  const [step, setStep] = useState<ImportStepType>("upload");

  // Upload state
  const [fileName, setFileName] = useState("");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);

  // Mapping state
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);

  // Preview state
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<DuplicateStrategy>("skip");

  // Import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importCompleted, setImportCompleted] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);

  function resetWizard() {
    setStep("upload");
    setFileName("");
    setRawHeaders([]);
    setRawRows([]);
    setMappings([]);
    setValidatedRows([]);
    setDuplicateCount(0);
    setDuplicateStrategy("skip");
    setImporting(false);
    setImportProgress(0);
    setImportCompleted(0);
    setImportTotal(0);
    setImportResult(null);
  }

  const importContext = useMemo(
    () => ({
      entityType,
      fieldDefinitions,
      stages,
      defaultStageKey: defaultStage?.stage_key ?? null,
    }),
    [entityType, fieldDefinitions, stages, defaultStage]
  );

  // Upload handler
  const handleParsed = useCallback(
    (result: ParseResult, name: string) => {
      setFileName(name);
      setRawHeaders(result.headers);
      setRawRows(result.rows);
      // Auto-detect mappings
      const detected = autoDetectMappings(
        result.headers,
        entityType,
        fieldDefinitions
      );
      setMappings(detected);
    },
    [entityType, fieldDefinitions]
  );

  // Advance to preview — run validation + duplicate check
  const goToPreview = useCallback(async () => {
    const transformed = transformRows(rawRows, mappings, importContext);
    const validated = validateRows(transformed, importContext);
    setValidatedRows(validated);

    const dupes = await countDuplicates(supabase, entityType, validated);
    setDuplicateCount(dupes);

    setStep("preview");
  }, [rawRows, mappings, importContext, supabase, entityType]);

  // Run import
  const runImport = useCallback(async () => {
    setStep("import");
    setImporting(true);
    setImportProgress(0);
    setImportCompleted(0);

    const validRows = validatedRows.filter((r) => r.isValid);
    setImportTotal(validRows.length);

    const result = await executeImport({
      supabase,
      entityType,
      rows: validatedRows,
      duplicateStrategy,
      fileName,
      onProgress: (completed, total) => {
        setImportCompleted(completed);
        setImportProgress(total > 0 ? Math.round((completed / total) * 100) : 100);
      },
    });

    setImportResult(result);
    setImporting(false);
  }, [validatedRows, supabase, entityType, duplicateStrategy, fileName]);

  // Navigation
  const canAdvance = (() => {
    switch (step) {
      case "upload":
        return rawRows.length > 0;
      case "map":
        return mappings.some((m) => m.destinationField === "name");
      case "preview":
        return validatedRows.some((r) => r.isValid);
      default:
        return false;
    }
  })();

  function handleBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  }

  function handleNext() {
    if (!canAdvance) return;
    if (step === "map") {
      goToPreview();
      return;
    }
    if (step === "preview") {
      runImport();
      return;
    }
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1]);
    }
  }

  function handleDone() {
    onComplete();
    resetWizard();
    onClose();
  }

  function handleClose() {
    resetWizard();
    onClose();
  }

  const entityLabel = entityType === "contact" ? "contacts" : "organizations";

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && !importing && handleClose()}>
      <ResponsiveDialogContent variant="fullscreen"
        className="flex max-h-[85vh] flex-col gap-0 sm:max-w-3xl"
        showCloseButton={!importing}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border/60 px-6 py-4">
          {stepIndex > 0 && step !== "import" && (
            <button
              type="button"
              onClick={handleBack}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1">
            <ResponsiveDialogTitle className="text-[14px] font-medium">
              Import {entityLabel}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="text-[12px] text-muted-foreground">
              {STEP_LABELS[step]}
            </ResponsiveDialogDescription>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === "upload" && <UploadStep onParsed={handleParsed} />}
          {step === "map" && (
            <MappingStep
              headers={rawHeaders}
              rawRows={rawRows}
              mappings={mappings}
              entityType={entityType}
              fieldDefinitions={fieldDefinitions}
              onMappingsChange={setMappings}
            />
          )}
          {step === "preview" && (
            <PreviewStep
              rows={validatedRows}
              mappings={mappings}
              duplicateCount={duplicateCount}
              duplicateStrategy={duplicateStrategy}
              onDuplicateStrategyChange={setDuplicateStrategy}
            />
          )}
          {step === "import" && (
            <ImportStep
              importing={importing}
              progress={importProgress}
              completed={importCompleted}
              total={importTotal}
              result={importResult}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
          {/* Step indicators */}
          <div className="flex items-center gap-1.5">
            {STEP_ORDER.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  i <= stepIndex
                    ? "bg-primary"
                    : "bg-muted-foreground/30"
                )}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {step === "import" && importResult ? (
              <Button size="sm" onClick={handleDone}>
                Done
              </Button>
            ) : (
              <>
                {!importing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClose}
                  >
                    Cancel
                  </Button>
                )}
                {step !== "import" && (
                  <Button
                    size="sm"
                    onClick={handleNext}
                    disabled={!canAdvance}
                  >
                    {step === "preview" ? "Import" : "Continue"}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
