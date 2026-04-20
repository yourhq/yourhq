"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Document, DocumentFolder } from "@/lib/documents/types";
import type { JSONContent } from "novel";
import { logAudit } from "@/lib/audit/log";
import { NovelEditor } from "./novel-editor";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Archive,
  Check,
  Download,
  FolderOpen,
  Loader2,
  Pin,
  PinOff,
  Tag,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { BootTagManager } from "./boot-tag-manager";
import { getBootTags, getRegularTags } from "@/lib/documents/boot-tags";
import { convertMarkdownContent } from "@/lib/documents/markdown-to-tiptap";
import { downloadDocumentAsMarkdown } from "@/lib/documents/export-markdown";
import { buildFolderTree, flattenFolderTree, getFolderPath } from "@/lib/documents/tree";
import Link from "next/link";

interface DocumentEditorProps {
  document: Document;
  folders: DocumentFolder[];
  agents: { slug: string; name: string }[];
}

export function DocumentEditor({ document: doc, folders, agents }: DocumentEditorProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState(doc.title);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [folderId, setFolderId] = useState(doc.folder_id || "none");
  const [tags, setTags] = useState<string[]>(doc.tags || []);
  const [pinned, setPinned] = useState(doc.pinned);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<JSONContent | undefined>(undefined);

  // Parse initial content from stored JSON, converting markdown-in-paragraphs if detected
  const initialContent = useMemo(() => {
    if (!doc.content) return undefined;
    try {
      const parsed = JSON.parse(doc.content) as JSONContent;
      return convertMarkdownContent(parsed);
    } catch {
      return undefined;
    }
  }, [doc.content]);

  const save = useCallback(
    async (updates: Record<string, unknown>) => {
      setSaving(true);
      await supabase
        .from("documents")
        .update(updates)
        .eq("id", doc.id);
      logAudit(supabase, {
        module: "documents",
        entity_type: "document",
        entity_id: doc.id,
        action: "updated",
        summary: `Updated document '${title}'`,
      });
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    [supabase, doc.id, title]
  );

  // Initialize contentRef from parsed initial content
  if (contentRef.current === undefined && initialContent) {
    contentRef.current = initialContent;
  }

  // Debounced auto-save for content (stored as Tiptap JSON)
  const debouncedSaveContent = useCallback(
    (json: JSONContent) => {
      contentRef.current = json;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        save({ content: JSON.stringify(json) });
      }, 1000);
    },
    [save]
  );

  // Save title on blur
  function handleTitleBlur() {
    if (title !== doc.title && title.trim()) {
      save({ title: title.trim() });
    }
  }

  // Save title on Enter
  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    }
  }

  // Save folder change
  async function handleFolderChange(value: string) {
    const newFolderId = value === "none" ? null : value;
    setFolderId(value);
    save({ folder_id: newFolderId });
  }

  // Save boot tags change (merge with existing regular tags)
  function handleBootTagsChange(newBootTags: string[]) {
    const merged = [...newBootTags, ...getRegularTags(tags)];
    setTags(merged);
    save({ tags: merged });
  }

  // Save regular tags change (merge with existing boot tags, strip any boot: prefix from input)
  function handleRegularTagsChange(newRegularTags: string[]) {
    const cleaned = newRegularTags.filter((t) => !t.startsWith("boot:"));
    const merged = [...getBootTags(tags), ...cleaned];
    setTags(merged);
    save({ tags: merged });
  }

  // Toggle pin
  async function handleTogglePin() {
    const newPinned = !pinned;
    setPinned(newPinned);
    save({ pinned: newPinned });
  }

  // Archive
  async function handleArchive() {
    await supabase.from("documents").update({ archived_at: new Date().toISOString() }).eq("id", doc.id);
    logAudit(supabase, {
      module: "documents",
      entity_type: "document",
      entity_id: doc.id,
      action: "archived",
      summary: `Archived document '${doc.title}'`,
    });
    toast("Document archived");
    router.push("/dashboard/documents");
  }

  // Export as markdown
  function handleExport() {
    downloadDocumentAsMarkdown(title, contentRef.current, doc.id);
    toast("Downloaded as Markdown");
  }

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const flatFolders = useMemo(
    () => flattenFolderTree(buildFolderTree(folders)),
    [folders]
  );
  const folderPath = useMemo(
    () => getFolderPath(folders, doc.folder_id),
    [folders, doc.folder_id]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <Link href="/dashboard/documents">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        <span className="text-xs text-muted-foreground truncate">
          {folderPath.length > 0
            ? folderPath.map((f) => f.name).join(" / ")
            : "Documents"}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {/* Save status */}
          <span className="text-[11px] text-muted-foreground mr-2">
            {saving ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            ) : saved ? (
              <span className="flex items-center gap-1 text-green-400">
                <Check className="h-3 w-3" />
                Saved
              </span>
            ) : null}
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleExport}
            title="Download as Markdown"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleTogglePin}
            title={pinned ? "Unpin" : "Pin"}
          >
            {pinned ? (
              <PinOff className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleArchive}
            title="Archive"
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {/* Title */}
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            placeholder="Untitled"
            className="w-full resize-none border-0 bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            rows={1}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = target.scrollHeight + "px";
            }}
          />

          {/* Properties */}
          <div className="mt-4 mb-8 space-y-0.5">
            {/* Folder */}
            <div className="flex items-center gap-3 min-h-[30px]">
              <span className="w-24 shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground select-none">
                <FolderOpen className="h-3.5 w-3.5" />
                Folder
              </span>
              <Select value={folderId} onValueChange={handleFolderChange}>
                <SelectTrigger className="h-7 w-auto min-w-[100px] max-w-[180px] text-xs !border-0 !bg-transparent !shadow-none hover:bg-muted rounded px-1.5 -ml-1.5 !ring-0">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {flatFolders.map(({ folder: f, depth }) => (
                    <SelectItem
                      key={f.id}
                      value={f.id}
                      style={{ paddingLeft: depth * 12 + 8 }}
                    >
                      {f.icon ? `${f.icon} ` : ""}{f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Boot context */}
            <div className="flex items-center gap-3 min-h-[30px]">
              <span className="w-24 shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground select-none">
                <Zap className="h-3.5 w-3.5" />
                Context
              </span>
              <div className="flex-1 min-w-0 -ml-0.5">
                <BootTagManager
                  bootTags={getBootTags(tags)}
                  agents={agents}
                  onChange={handleBootTagsChange}
                />
              </div>
            </div>

            {/* Tags */}
            <div className="flex items-start gap-3 min-h-[30px] pt-0.5">
              <span className="w-24 shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground select-none mt-1">
                <Tag className="h-3.5 w-3.5" />
                Tags
              </span>
              <div className="flex-1 min-w-0 -ml-0.5">
                <TagInput
                  value={getRegularTags(tags)}
                  onChange={handleRegularTagsChange}
                  placeholder="Add tag..."
                  className="min-h-[28px] !border-0 !shadow-none !ring-0 hover:bg-muted/50 focus-within:!bg-muted/50 rounded px-1.5 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Novel editor */}
          <NovelEditor
            initialContent={initialContent}
            onChange={debouncedSaveContent}
            className="min-h-[60vh]"
          />
        </div>
      </div>
    </div>
  );
}
