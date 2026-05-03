"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { KnowledgeItem, KnowledgeFolder } from "@/lib/knowledge/types";
import type { JSONContent } from "novel";
import { logAudit } from "@/lib/audit/log";
import { NovelEditor } from "./novel-editor";
import { KnowledgeKindBadge } from "./knowledge-kind-badge";
import { EmbeddingStatus } from "./embedding-status";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Archive,
  Check,
  Download,
  ExternalLink,
  FolderOpen,
  Globe2,
  Bot,
  Loader2,
  Pin,
  PinOff,
  RefreshCw,
  Tag,
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
import { shouldReembed, withPendingEmbedding } from "@/lib/knowledge/embedding";
import { convertMarkdownContent } from "@/lib/knowledge/markdown-to-tiptap";
import { downloadAsMarkdown } from "@/lib/knowledge/export-markdown";
import { buildFolderTree, flattenFolderTree, getFolderPath } from "@/lib/knowledge/tree";
import { getSourceUrl, PROVIDER_LABELS } from "@/lib/sources/types";
import type { SourceProvider } from "@/lib/sources/types";
import { ProviderIcon } from "@/components/sources/provider-icon";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface KnowledgeDetailEditorProps {
  item: KnowledgeItem;
  folders: KnowledgeFolder[];
}

export function KnowledgeDetailEditor({
  item,
  folders,
}: KnowledgeDetailEditorProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState(item.title);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [folderId, setFolderId] = useState(item.folder_id || "none");
  const [tags, setTags] = useState<string[]>(item.tags || []);
  const [pinned, setPinned] = useState(item.pinned);
  const [scope, setScope] = useState(item.scope);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initialContent = useMemo<JSONContent | undefined>(() => {
    if (!item.content) return undefined;
    try {
      const parsed =
        typeof item.content === "string"
          ? (JSON.parse(item.content) as JSONContent)
          : (item.content as unknown as JSONContent);
      return convertMarkdownContent(parsed);
    } catch {
      return undefined;
    }
  }, [item.content]);

  const contentRef = useRef<JSONContent | undefined>(initialContent);

  const save = useCallback(
    async (updates: Record<string, unknown>) => {
      setSaving(true);
      const payload = shouldReembed(updates)
        ? withPendingEmbedding(updates)
        : updates;
      await supabase
        .from("knowledge_items")
        .update(payload)
        .eq("id", item.id);
      logAudit(supabase, {
        module: "knowledge",
        entity_type: "knowledge_item",
        entity_id: item.id,
        action: "updated",
        summary: `Updated '${title}'`,
      });
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    [supabase, item.id, title]
  );

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

  function handleTitleBlur() {
    if (title !== item.title && title.trim()) {
      save({ title: title.trim() });
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    }
  }

  async function handleFolderChange(value: string) {
    const newFolderId = value === "none" ? null : value;
    setFolderId(value);
    save({ folder_id: newFolderId });
  }

  function handleTagsChange(newTags: string[]) {
    setTags(newTags);
    save({ tags: newTags });
  }

  async function handleScopeChange(value: string) {
    const newScope = value as "workspace" | "agent";
    setScope(newScope);
    save({ scope: newScope });
  }

  async function handleTogglePin() {
    const newPinned = !pinned;
    setPinned(newPinned);
    save({ pinned: newPinned });
  }

  async function handleArchive() {
    await supabase
      .from("knowledge_items")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", item.id);
    logAudit(supabase, {
      module: "knowledge",
      entity_type: "knowledge_item",
      entity_id: item.id,
      action: "archived",
      summary: `Archived '${item.title}'`,
    });
    toast("Item archived");
    router.push("/dashboard/knowledge");
  }

  function handleExport() {
    downloadAsMarkdown(title, contentRef.current, item.id);
    toast("Downloaded as Markdown");
  }

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
    () => getFolderPath(folders, item.folder_id),
    [folders, item.folder_id]
  );

  const isEditable = item.kind === "page" || item.kind === "playbook";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <Link href="/dashboard/knowledge">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        <span className="text-xs text-muted-foreground truncate">
          {folderPath.length > 0
            ? folderPath.map((f) => f.name).join(" / ")
            : "Knowledge"}
        </span>

        <KnowledgeKindBadge kind={item.kind} className="ml-2" />

        <div className="ml-auto flex items-center gap-1">
          <EmbeddingStatus
            embeddingStatus={item.embedding_status}
            chunkStatus={item.chunk_status}
          />

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

          {isEditable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleExport}
              title="Download as Markdown"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}

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

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
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

          <div className="mt-4 mb-8 space-y-0.5">
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
                      {f.icon ? `${f.icon} ` : ""}
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 min-h-[30px]">
              <span className="w-24 shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground select-none">
                {scope === "workspace" ? (
                  <Globe2 className="h-3.5 w-3.5" />
                ) : (
                  <Bot className="h-3.5 w-3.5" />
                )}
                Scope
              </span>
              <Select value={scope} onValueChange={handleScopeChange}>
                <SelectTrigger className="h-7 w-auto min-w-[100px] max-w-[180px] text-xs !border-0 !bg-transparent !shadow-none hover:bg-muted rounded px-1.5 -ml-1.5 !ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace">
                    <span className="flex items-center gap-1.5">
                      <Globe2 className="h-3.5 w-3.5" />
                      Workspace
                    </span>
                  </SelectItem>
                  <SelectItem value="agent">
                    <span className="flex items-center gap-1.5">
                      <Bot className="h-3.5 w-3.5" />
                      Agent
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-3 min-h-[30px] pt-0.5">
              <span className="w-24 shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground select-none mt-1">
                <Tag className="h-3.5 w-3.5" />
                Tags
              </span>
              <div className="flex-1 min-w-0 -ml-0.5">
                <TagInput
                  value={tags}
                  onChange={handleTagsChange}
                  placeholder="Add tag..."
                  className="min-h-[28px] !border-0 !shadow-none !ring-0 hover:bg-muted/50 focus-within:!bg-muted/50 rounded px-1.5 text-xs"
                />
              </div>
            </div>
          </div>

          {isEditable ? (
            <NovelEditor
              initialContent={initialContent}
              onChange={debouncedSaveContent}
              className="min-h-[60vh]"
            />
          ) : item.kind === "file" ? (
            <div className="rounded-lg border border-border/50 p-6 text-center text-sm text-muted-foreground">
              <p>
                {item.file_url
                  ? `File: ${item.title}`
                  : "No file attached"}
              </p>
              {item.processing_status === "processing" && (
                <p className="mt-2 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing file...
                </p>
              )}
              {item.processing_status === "failed" && (
                <p className="mt-2 text-red-400">
                  Processing failed: {item.processing_error}
                </p>
              )}
              {item.plain_text && (
                <div className="mt-4 text-left whitespace-pre-wrap text-xs text-muted-foreground/80 max-h-[60vh] overflow-auto">
                  {item.plain_text}
                </div>
              )}
            </div>
          ) : item.kind === "source" ? (
            <SourceDetailView item={item} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SourceDetailView({ item }: { item: KnowledgeItem }) {
  const provider = (item.meta as Record<string, unknown>)?.provider as SourceProvider | undefined;
  const sourceUrl =
    (item.meta as Record<string, unknown>)?.source_url as string | undefined
    ?? (item.source_external_id && provider
      ? getSourceUrl(provider, item.source_external_id)
      : null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground">
        {provider && <ProviderIcon provider={provider} className="h-4 w-4" />}
        <span>
          This content is synced from {provider ? PROVIDER_LABELS[provider] : "an external source"}.
          Edits should be made in the original.
        </span>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-primary hover:underline shrink-0"
          >
            Open in {provider ? PROVIDER_LABELS[provider] : "source"}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {item.source_sync_status === "source_deleted" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          This item has been deleted in the source and will no longer receive updates.
        </div>
      )}

      {item.source_sync_status === "error" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          The last sync failed. The content below may be outdated.
        </div>
      )}

      <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
        {item.source_synced_at && (
          <span className="flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Synced {formatDistanceToNow(new Date(item.source_synced_at), { addSuffix: true })}
          </span>
        )}
      </div>

      {item.plain_text ? (
        <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
          {item.plain_text}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Content not yet synced. It will appear after the next sync cycle.
        </div>
      )}
    </div>
  );
}
