import { describe, test, expect } from "vitest";
import {
  withPendingEmbedding,
  shouldReembed,
} from "@/lib/knowledge/embedding";

describe("withPendingEmbedding", () => {
  test("adds all embedding reset fields", () => {
    const result = withPendingEmbedding({ title: "Hello" });
    expect(result.title).toBe("Hello");
    expect(result.embedding).toBeNull();
    expect(result.embedding_model).toBeNull();
    expect(result.embedding_dimensions).toBeNull();
    expect(result.embedding_status).toBe("pending");
    expect(result.embedding_source_hash).toBeNull();
    expect(result.embedding_updated_at).toBeNull();
    expect(result.embedding_error).toBeNull();
    expect(result.embedding_leased_by).toBeNull();
    expect(result.embedding_leased_until).toBeNull();
    expect(result.chunk_status).toBe("pending");
    expect(result.chunk_count).toBe(0);
    expect(result.chunk_source_hash).toBeNull();
    expect(result.chunks_updated_at).toBeNull();
    expect(result.chunk_error).toBeNull();
  });

  test("preserves original fields in result", () => {
    const input = { title: "Test", content: "Body", extra: 42 };
    const result = withPendingEmbedding(input);
    expect(result.title).toBe("Test");
    expect(result.content).toBe("Body");
    expect(result.extra).toBe(42);
  });

  test("does not mutate the input object", () => {
    const input = { title: "Original" };
    withPendingEmbedding(input);
    expect(input).toEqual({ title: "Original" });
  });
});

describe("shouldReembed", () => {
  test("returns true when title is present", () => {
    expect(shouldReembed({ title: "New Title" })).toBe(true);
  });

  test("returns true when content is present", () => {
    expect(shouldReembed({ content: "New content" })).toBe(true);
  });

  test("returns true when plain_text is present", () => {
    expect(shouldReembed({ plain_text: "extracted text" })).toBe(true);
  });

  test("returns true when tags is present", () => {
    expect(shouldReembed({ tags: ["a", "b"] })).toBe(true);
  });

  test("returns false when only unrelated fields change", () => {
    expect(shouldReembed({ folder_id: "123", scope: "workspace" })).toBe(false);
  });

  test("returns false for empty object", () => {
    expect(shouldReembed({})).toBe(false);
  });

  test("returns true even when value is undefined (key exists)", () => {
    expect(shouldReembed({ title: undefined })).toBe(true);
  });
});
