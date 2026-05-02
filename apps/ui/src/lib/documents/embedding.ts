export function withPendingEmbedding<T extends Record<string, unknown>>(updates: T): T {
  return {
    ...updates,
    embedding: null,
    embedding_model: null,
    embedding_dimensions: null,
    embedding_status: "pending",
    embedding_source_hash: null,
    embedding_updated_at: null,
    embedding_error: null,
    embedding_leased_by: null,
    embedding_leased_until: null,
  };
}

export function shouldReembedDocument(updates: Record<string, unknown>) {
  return "title" in updates || "content" in updates || "tags" in updates;
}
