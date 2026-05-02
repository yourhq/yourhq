// Document Types — mirrors Supabase schema

export interface DocumentFolder {
  id: string;
  created_at: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  sort_order: number;
  // Computed
  children?: DocumentFolder[];
  doc_count?: number;
}

export interface Document {
  id: string;
  created_at: string;
  updated_at: string;
  folder_id: string | null;
  title: string;
  content: string | null;
  icon: string | null;
  tags: string[];
  meta: Record<string, unknown>;
  pinned: boolean;
  archived_at: string | null;
  last_edited_by: string | null;
  embedding: number[] | null;
  embedding_model: string | null;
  embedding_dimensions: number | null;
  embedding_status: "pending" | "indexed" | "failed" | null;
  embedding_source_hash: string | null;
  embedding_updated_at: string | null;
  embedding_error: string | null;
  embedding_leased_by: string | null;
  embedding_leased_until: string | null;
  // Joined
  folder?: DocumentFolder | null;
}
