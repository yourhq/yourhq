"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "novel";
import { NovelEditor } from "@/components/knowledge/novel-editor";
import { markdownToTiptap } from "@/lib/knowledge/markdown-to-tiptap";
import { tiptapToMarkdown } from "@/lib/knowledge/tiptap-to-markdown";
import { Button } from "@/components/ui/button";
import { Check, FileText, GitBranch, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AgentFileEditorProps {
  slug: string;
  path: string | null;
  content: string | null;
  sha: string | null;
  onSaved: (newSha: string) => void;
  loading?: boolean;
}

export function AgentFileEditor({
  slug,
  path,
  content,
  sha,
  onSaved,
  loading,
}: AgentFileEditorProps) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const editorContentRef = useRef<JSONContent | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Convert markdown content to Tiptap JSON
  const initialContent = useMemo(() => {
    if (content == null) return undefined;
    return markdownToTiptap(content);
  }, [content]);

  // Reset dirty state when file changes
  useEffect(() => {
    setDirty(false);
    setSaved(false);
    editorContentRef.current = null;
  }, [path, content]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleEditorChange = useCallback(
    (json: JSONContent) => {
      editorContentRef.current = json;
      if (!dirty) setDirty(true);
    },
    [dirty]
  );

  async function handleSave() {
    if (!path || !sha || !editorContentRef.current) return;

    setSaving(true);
    try {
      const markdown = tiptapToMarkdown(editorContentRef.current);
      const res = await fetch(`/api/agents/${slug}/files/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: markdown, sha }),
      });

      if (!res.ok) {
        const err = await res.json();
        if (res.status === 409) {
          toast.error("File was modified elsewhere. Please reload and try again.");
        } else {
          toast.error(err.error || "Failed to save file");
        }
        return;
      }

      const data = await res.json();
      onSaved(data.sha);
      setDirty(false);
      setSaved(true);
      toast.success(`Pushed to ${slug}`);

      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error("Failed to save file");
    } finally {
      setSaving(false);
    }
  }

  // Empty state
  if (!path) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <FileText className="h-10 w-10 opacity-20" />
        <p className="text-sm">Select a file to edit</p>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-10 border-b border-border/50 px-3 flex items-center">
          <div className="h-4 w-48 bg-muted/30 rounded animate-pulse" />
        </div>
        <div className="flex-1 p-6">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="h-8 w-64 bg-muted/30 rounded animate-pulse" />
            <div className="h-4 w-full bg-muted/20 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-muted/20 rounded animate-pulse" />
            <div className="h-4 w-5/6 bg-muted/20 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const pathSegments = path.split("/");

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-2 h-10 border-b border-border/50 px-3 shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 flex-1">
          {pathSegments.map((segment, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-border">/</span>}
              <span
                className={
                  i === pathSegments.length - 1
                    ? "text-foreground font-medium truncate"
                    : "truncate"
                }
              >
                {segment}
              </span>
            </span>
          ))}
        </div>

        {/* Status + Save */}
        <div className="flex items-center gap-2 shrink-0">
          {dirty && !saving && !saved && (
            <span className="h-2 w-2 rounded-full bg-accent-orange" title="Unsaved changes" />
          )}
          {saved && (
            <span className="flex items-center gap-1 text-[11px] text-status-success">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={!dirty || saving}
            onClick={handleSave}
          >
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Pushing...
              </>
            ) : (
              <>
                <GitBranch className="h-3 w-3" />
                Save & Push
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <NovelEditor
            key={path}
            initialContent={initialContent}
            onChange={handleEditorChange}
            className="min-h-[60vh]"
          />
        </div>
      </div>
    </div>
  );
}
