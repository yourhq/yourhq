"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";
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
  Clock,
  Download,
  ExternalLink,
  FileDown,
  FolderOpen,
  Globe2,
  Bot,
  Loader2,
  Pin,
  PinOff,
  RefreshCw,
  RotateCw,
  Tag,
  X,
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
import { convertMarkdownContent, markdownToTiptap } from "@/lib/knowledge/markdown-to-tiptap";
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
  const [showHistory, setShowHistory] = useState(false);
  const [allAgents, setAllAgents] = useState<{ id: string; name: string; emoji?: string }[]>([]);
  const [assignedAgentIds, setAssignedAgentIds] = useState<string[]>([]);
  const [embeddingStatus, setEmbeddingStatus] = useState(item.embedding_status);
  const [chunkStatus, setChunkStatus] = useState(item.chunk_status);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useRealtime({
    table: "knowledge_items",
    event: "UPDATE",
    filter: `id=eq.${item.id}`,
    onPayload: (payload) => {
      const row = payload.new as Record<string, unknown>;
      if (row.embedding_status) setEmbeddingStatus(row.embedding_status as typeof embeddingStatus);
      if (row.chunk_status) setChunkStatus(row.chunk_status as typeof chunkStatus);
    },
  });

  useEffect(() => {
    async function loadAgents() {
      const [{ data: agents }, { data: assigned }] = await Promise.all([
        supabase.from("agents").select("id, name, meta").order("name"),
        supabase.from("knowledge_item_agents").select("agent_id").eq("knowledge_item_id", item.id),
      ]);
      setAllAgents(
        (agents ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          emoji: (a.meta as { emoji?: string } | null)?.emoji,
        }))
      );
      setAssignedAgentIds((assigned ?? []).map((r) => r.agent_id));
    }
    loadAgents();
  }, [supabase, item.id]);

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
      setHistoryRefreshKey((k) => k + 1);
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
    if (newScope === "workspace") {
      await supabase.from("knowledge_item_agents").delete().eq("knowledge_item_id", item.id);
      setAssignedAgentIds([]);
    }
  }

  async function handleToggleAgent(agentId: string) {
    const isAssigned = assignedAgentIds.includes(agentId);
    if (isAssigned) {
      await supabase
        .from("knowledge_item_agents")
        .delete()
        .eq("knowledge_item_id", item.id)
        .eq("agent_id", agentId);
      setAssignedAgentIds((prev) => prev.filter((id) => id !== agentId));
    } else {
      await supabase
        .from("knowledge_item_agents")
        .insert({ knowledge_item_id: item.id, agent_id: agentId });
      setAssignedAgentIds((prev) => [...prev, agentId]);
    }
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
    toast("Item archived", {
      action: {
        label: "Undo",
        onClick: async () => {
          await supabase
            .from("knowledge_items")
            .update({ archived_at: null })
            .eq("id", item.id);
          router.push(`/dashboard/knowledge/${item.id}`);
        },
      },
    });
    router.push("/dashboard/knowledge");
  }

  function handleExport() {
    downloadAsMarkdown(title, contentRef.current, item.id);
    toast("Downloaded as Markdown");
  }

  async function handleRetryEmbedding() {
    await supabase
      .from("knowledge_items")
      .update(withPendingEmbedding({}))
      .eq("id", item.id);
    setEmbeddingStatus("pending");
    setChunkStatus("pending");
    toast.success("Re-indexing queued");
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

  const isEditable = item.kind === "page" || item.kind === "skill";

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
            embeddingStatus={embeddingStatus}
            chunkStatus={chunkStatus}
          />
          {(embeddingStatus === "failed" || chunkStatus === "failed") && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive/80"
              onClick={handleRetryEmbedding}
              title="Retry indexing"
            >
              <RotateCw className="h-3 w-3" />
            </Button>
          )}

          <span className="text-[11px] text-muted-foreground mr-2">
            {saving ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            ) : saved ? (
              <span className="flex items-center gap-1 text-status-success">
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
            className="hidden h-7 w-7 text-muted-foreground hover:text-foreground lg:inline-flex"
            onClick={() => setShowHistory(!showHistory)}
            title="History"
          >
            <Clock className="h-3.5 w-3.5" />
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

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
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

            {scope === "agent" && (
              <div className="flex items-start gap-3 min-h-[30px] pt-0.5">
                <span className="w-24 shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground select-none mt-1">
                  <Bot className="h-3.5 w-3.5" />
                  Agents
                </span>
                <div className="flex-1 min-w-0 -ml-0.5">
                  {allAgents.length === 0 ? (
                    <span className="text-xs text-muted-foreground/50 px-1.5">No agents</span>
                  ) : (
                    <div className="flex flex-wrap gap-1 px-1">
                      {allAgents.map((a) => {
                        const selected = assignedAgentIds.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => handleToggleAgent(a.id)}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                              selected
                                ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                                : "bg-muted/50 text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {a.emoji && <span className="text-[11px]">{a.emoji}</span>}
                            {a.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {scope === "agent" && assignedAgentIds.length === 0 && allAgents.length > 0 && (
                    <p className="text-[10px] text-status-warning/70 px-1.5 mt-1">Select at least one agent</p>
                  )}
                </div>
              </div>
            )}

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
              className="min-h-[40vh] sm:min-h-[60vh]"
            />
          ) : item.kind === "file" ? (
            <FileDetailView item={item} supabase={supabase} />
          ) : item.kind === "source" ? (
            <SourceDetailView item={item} />
          ) : null}
          </div>
        </div>

        {showHistory && (
          <KnowledgeHistoryPanel
            itemId={item.id}
            refreshKey={historyRefreshKey}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </div>
  );
}

function KnowledgeHistoryPanel({
  itemId,
  refreshKey,
  onClose,
}: {
  itemId: string;
  refreshKey?: number;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<{
    id: string;
    created_at: string;
    actor_type: string;
    actor_agent_id: string | null;
    action: string;
    summary: string | null;
    agent_name?: string;
    agent_emoji?: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("audit_log")
        .select("id, created_at, actor_type, actor_agent_id, action, summary")
        .eq("entity_type", "knowledge_item")
        .eq("entity_id", itemId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!data) {
        setLoading(false);
        return;
      }

      const agentIds = [...new Set(
        data
          .filter((e: { actor_agent_id: string | null }) => e.actor_agent_id)
          .map((e: { actor_agent_id: string | null }) => e.actor_agent_id!)
      )];

      const agentMap = new Map<string, { name: string; emoji?: string }>();
      if (agentIds.length > 0) {
        const { data: agents } = await supabase
          .from("agents")
          .select("id, name, meta")
          .in("id", agentIds);
        for (const a of agents ?? []) {
          const meta = a.meta as { emoji?: string } | null;
          agentMap.set(a.id, { name: a.name, emoji: meta?.emoji });
        }
      }

      setEntries(
        data.map((e: { id: string; created_at: string; actor_type: string; actor_agent_id: string | null; action: string; summary: string | null }) => ({
          ...e,
          agent_name: e.actor_agent_id ? agentMap.get(e.actor_agent_id)?.name : undefined,
          agent_emoji: e.actor_agent_id ? agentMap.get(e.actor_agent_id)?.emoji : undefined,
        }))
      );
      setLoading(false);
    }
    fetch();
  }, [supabase, itemId, refreshKey]);

  return (
    <div className="hidden w-72 shrink-0 border-l border-border/50 overflow-auto lg:block">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          History
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={onClose}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="px-4 py-3 space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted/30" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">No edit history yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span>
                  {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                </span>
                <span>·</span>
                {entry.actor_type === "agent" && entry.agent_name ? (
                  <span className="text-foreground font-medium">
                    {entry.agent_emoji ? `${entry.agent_emoji} ` : ""}
                    {entry.agent_name}
                  </span>
                ) : (
                  <span className="text-foreground font-medium">You</span>
                )}
              </div>
              {entry.summary && (
                <p className="mt-0.5 text-muted-foreground/80 truncate">
                  {entry.summary}
                </p>
              )}
            </div>
          ))
        )}
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
        <div className="rounded-lg border border-status-error/30 bg-status-error/10 px-4 py-3 text-[13px] text-status-error">
          This item has been deleted in the source and will no longer receive updates.
        </div>
      )}

      {item.source_sync_status === "error" && (
        <div className="rounded-lg border border-status-error/30 bg-status-error/10 px-4 py-3 text-[13px] text-status-error">
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
        <NovelEditor
          initialContent={markdownToTiptap(item.plain_text)}
          editable={false}
          className="prose prose-invert prose-sm max-w-none"
        />
      ) : (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Content not yet synced. It will appear after the next sync cycle.
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileDetailView({
  item,
  supabase,
}: {
  item: KnowledgeItem;
  supabase: ReturnType<typeof createClient>;
}) {
  const fileUrl = item.file_url
    ? supabase.storage.from("assets").getPublicUrl(item.file_url).data.publicUrl
    : null;
  const isImage = item.mime_type?.startsWith("image/");

  return (
    <div className="space-y-4">
      {isImage && fileUrl && (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl}
            alt={item.title}
            className="max-w-full max-h-[60vh] object-contain mx-auto"
          />
        </div>
      )}

      <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground">
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="font-medium text-foreground truncate">{item.title}</p>
          <div className="flex items-center gap-3 text-[11px]">
            {item.mime_type && <span>{item.mime_type}</span>}
            {item.file_size != null && <span>{formatFileSize(item.file_size)}</span>}
          </div>
        </div>
        {fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={item.title}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors shrink-0"
          >
            <FileDown className="h-3.5 w-3.5" />
            Download
          </a>
        )}
      </div>

      {item.processing_status === "processing" && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processing file...
        </div>
      )}

      {item.processing_status === "failed" && (
        <div className="rounded-lg border border-status-error/30 bg-status-error/10 px-4 py-3 text-[13px] text-status-error">
          Processing failed: {item.processing_error}
        </div>
      )}

      {item.plain_text && (
        <div className="rounded-lg border border-border/50 p-4">
          <p className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Extracted text
          </p>
          <div className="whitespace-pre-wrap text-sm text-foreground/80 leading-relaxed max-h-[60vh] overflow-auto">
            {item.plain_text}
          </div>
        </div>
      )}
    </div>
  );
}
