export type KnowledgeKind = "page" | "playbook" | "file" | "source";
export type KnowledgeScope = "workspace" | "agent";

export interface KnowledgeFolder {
  id: string;
  created_at: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  children?: KnowledgeFolder[];
  item_count?: number;
}

export interface KnowledgeItem {
  id: string;
  created_at: string;
  updated_at: string;
  folder_id: string | null;
  kind: KnowledgeKind;
  title: string;
  content: string | null;
  plain_text: string | null;
  icon: string | null;
  mime_type: string | null;
  file_url: string | null;
  file_size: number | null;
  source_connection_id: string | null;
  source_external_id: string | null;
  source_sync_status: "synced" | "stale" | "error" | "source_deleted" | null;
  source_synced_at: string | null;
  scope: KnowledgeScope;
  tags: string[];
  pinned: boolean;
  meta: Record<string, unknown>;
  embedding_status: "pending" | "indexed" | "failed";
  chunk_status: "pending" | "indexed" | "failed";
  chunk_count: number;
  processing_status: "ready" | "processing" | "done" | "failed";
  processing_error: string | null;
  archived_at: string | null;
  folder?: KnowledgeFolder | null;
  agents?: { id: string; name: string; slug: string }[];
}

export interface KnowledgeChunkSearchResult {
  knowledge_item_id: string;
  title: string;
  tags: string[];
  folder_id: string | null;
  chunk_id: string;
  chunk_index: number;
  content: string;
  char_start: number | null;
  char_end: number | null;
  page_number: number | null;
  section_path: string[] | null;
  meta: Record<string, unknown>;
  updated_at: string;
  similarity: number;
}

export const KNOWLEDGE_KINDS: {
  value: KnowledgeKind;
  label: string;
  subtitle?: string;
  icon: string;
}[] = [
  { value: "page", label: "Page", icon: "file-text" },
  {
    value: "playbook",
    label: "Playbook",
    subtitle: "Skills, SOPs, instructions",
    icon: "book-open",
  },
  { value: "file", label: "File", icon: "file" },
  { value: "source", label: "Source", icon: "globe" },
];

export const KNOWLEDGE_KIND_COLORS: Record<KnowledgeKind, string> = {
  page: "bg-blue-500/20 text-blue-400",
  playbook: "bg-purple-500/20 text-purple-400",
  file: "bg-amber-500/20 text-amber-400",
  source: "bg-teal-500/20 text-teal-400",
};
