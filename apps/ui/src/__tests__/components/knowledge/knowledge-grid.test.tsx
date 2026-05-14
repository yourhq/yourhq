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

import { KnowledgeGrid } from "@/components/knowledge/knowledge-grid";

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
    pinned: false,
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

describe("KnowledgeGrid", () => {
  it("returns null when items array is empty", () => {
    const { container } = render(
      <KnowledgeGrid
        items={[]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders item titles as links", () => {
    render(
      <KnowledgeGrid
        items={[makeItem()]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/dashboard/knowledge/ki-1");
  });

  it("renders kind and scope badges", () => {
    render(
      <KnowledgeGrid
        items={[makeItem({ kind: "skill", scope: "agent" })]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("skill")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("shows icon and pinned indicator", () => {
    render(
      <KnowledgeGrid
        items={[makeItem({ icon: "🔖", pinned: true })]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("🔖")).toBeInTheDocument();
  });

  it("shows folder name in footer", () => {
    render(
      <KnowledgeGrid
        items={[
          makeItem({
            folder: { id: "f-1", name: "Archive", parent_id: null, icon: null, color: null, sort_order: 0, created_at: "2025-01-01T00:00:00Z" },
          }),
        ]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("Archive")).toBeInTheDocument();
  });

  it("shows search snippets when provided", () => {
    render(
      <KnowledgeGrid
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
              content: "Found this text",
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
    expect(screen.getByText("Found this text")).toBeInTheDocument();
  });

  it("renders multiple items", () => {
    render(
      <KnowledgeGrid
        items={[
          makeItem({ id: "ki-1", title: "Page A" }),
          makeItem({ id: "ki-2", title: "Page B" }),
          makeItem({ id: "ki-3", title: "Page C" }),
        ]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("Page A")).toBeInTheDocument();
    expect(screen.getByText("Page B")).toBeInTheDocument();
    expect(screen.getByText("Page C")).toBeInTheDocument();
  });

  it("shows embedding status for page items", () => {
    render(
      <KnowledgeGrid
        items={[
          makeItem({
            kind: "page",
            embedding_status: "pending",
            chunk_status: "pending",
          }),
        ]}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
        showArchived={false}
      />
    );
    expect(screen.getByText("Indexing...")).toBeInTheDocument();
  });
});
