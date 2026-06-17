import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { KnowledgeItem } from "@/lib/knowledge/types";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/sources/generated-manifests", () => ({
  PROVIDER_MANIFESTS: {} as Record<string, unknown>,
}));

import { KnowledgeList } from "@/components/knowledge/knowledge-list";

function makeItem(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id: "ki-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    folder_id: null,
    kind: "page",
    title: "Getting Started",
    content: null,
    plain_text: null,
    icon: null,
    mime_type: null,
    file_url: null,
    file_size: null,
    source_connection_id: null,
    source_external_id: null,
    source_sync_status: null,
    source_synced_at: null,
    scope: "workspace",
    tags: [],
    meta: {},
    embedding_status: "indexed",
    chunk_status: "indexed",
    chunk_count: 3,
    processing_status: "done",
    processing_error: null,
    archived_at: null,
    ...overrides,
  };
}

const noop = vi.fn();

describe("KnowledgeList", () => {
  it("returns null when items array is empty", () => {
    const { container } = render(
      <KnowledgeList
        items={[]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders item titles", () => {
    render(
      <KnowledgeList
        items={[makeItem(), makeItem({ id: "ki-2", title: "API Docs" })]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("API Docs")).toBeInTheDocument();
  });

  it("renders kind badge for page", () => {
    render(
      <KnowledgeList
        items={[makeItem({ kind: "page" })]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("page")).toBeInTheDocument();
  });

  it("renders scope badge", () => {
    render(
      <KnowledgeList
        items={[makeItem({ scope: "agent" })]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("shows icon when present", () => {
    render(
      <KnowledgeList
        items={[makeItem({ icon: "📄" })]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("📄")).toBeInTheDocument();
  });

  it("shows folder name when item has a folder", () => {
    const item = makeItem({
      folder: { id: "f-1", name: "Docs", parent_id: null, icon: null, color: null, sort_order: 0, created_at: "2025-01-01T00:00:00Z" },
    });
    render(
      <KnowledgeList
        items={[item]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("Docs")).toBeInTheDocument();
  });

  it("links to the knowledge detail page", () => {
    render(
      <KnowledgeList
        items={[makeItem()]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/dashboard/knowledge/ki-1");
  });

  it("shows search snippets when provided", () => {
    render(
      <KnowledgeList
        items={[makeItem()]}
        searchSnippets={{
          "ki-1": [
            {
              knowledge_item_id: "ki-1",
              title: "Getting Started",
              tags: [],
              folder_id: null,
              chunk_id: "ch-1",
              chunk_index: 0,
              content: "This is a matching snippet",
              char_start: null,
              char_end: null,
              page_number: null,
              section_path: null,
              meta: {},
              updated_at: "2025-01-01T00:00:00Z",
              similarity: 0.9,
            },
          ],
        }}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("This is a matching snippet")).toBeInTheDocument();
  });

  it("renders embedding status for page kind", () => {
    render(
      <KnowledgeList
        items={[makeItem({ kind: "page", embedding_status: "indexed", chunk_status: "indexed" })]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("Search ready")).toBeInTheDocument();
  });

  it("renders different kinds with correct badge text", () => {
    render(
      <KnowledgeList
        items={[
          makeItem({ id: "ki-a", kind: "skill", title: "Skill item" }),
          makeItem({ id: "ki-b", kind: "file", title: "File item", processing_status: "done" }),
        ]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("skill")).toBeInTheDocument();
    expect(screen.getByText("file")).toBeInTheDocument();
  });
});
