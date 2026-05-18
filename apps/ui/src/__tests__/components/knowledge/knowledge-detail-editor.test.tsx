import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildKnowledgeItem } from "@/__tests__/helpers/factories/knowledge-item";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

vi.mock("@/components/knowledge/novel-editor", () => ({
  NovelEditor: () => <div data-testid="novel-editor">Editor</div>,
}));

vi.mock("@/components/knowledge/knowledge-kind-badge", () => ({
  KnowledgeKindBadge: ({ kind }: { kind: string }) => (
    <span data-testid="kind-badge">{kind}</span>
  ),
}));

vi.mock("@/components/knowledge/embedding-status", () => ({
  EmbeddingStatus: () => <span data-testid="embedding-status" />,
}));

vi.mock("@/lib/knowledge/embedding", () => ({
  shouldReembed: () => false,
  withPendingEmbedding: (u: Record<string, unknown>) => u,
}));

vi.mock("@/lib/knowledge/markdown-to-tiptap", () => ({
  convertMarkdownContent: (c: unknown) => c,
  markdownToTiptap: (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] }),
}));

vi.mock("@/lib/knowledge/export-markdown", () => ({
  downloadAsMarkdown: vi.fn(),
}));

vi.mock("@/lib/knowledge/tree", () => ({
  buildFolderTree: () => [],
  flattenFolderTree: () => [],
  getFolderPath: () => [],
}));

vi.mock("@/lib/sources/types", () => ({
  getSourceUrl: vi.fn(),
  PROVIDER_LABELS: {},
}));

vi.mock("@/components/sources/provider-icon", () => ({
  ProviderIcon: () => null,
}));

vi.mock("@/components/ui/tag-input", () => ({
  TagInput: ({ placeholder }: { placeholder: string }) => (
    <div data-testid="tag-input">{placeholder}</div>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { KnowledgeDetailEditor } from "@/components/knowledge/knowledge-detail-editor";

beforeEach(() => {
  mockSupabase = createMockSupabaseClient();
});

afterEach(() => cleanup());

function renderEditor(overrides: Record<string, unknown> = {}) {
  const item = buildKnowledgeItem({
    title: "Getting Started",
    kind: "page",
    content: JSON.stringify({ type: "doc", content: [] }),
    ...overrides,
  });
  return render(<KnowledgeDetailEditor item={item as never} folders={[]} />);
}

describe("KnowledgeDetailEditor", () => {
  it("renders item title in the textarea", () => {
    renderEditor();
    expect(screen.getByDisplayValue("Getting Started")).toBeInTheDocument();
  });

  it("shows kind badge", () => {
    renderEditor({ kind: "skill" });
    expect(screen.getByTestId("kind-badge")).toHaveTextContent("skill");
  });

  it("shows sidebar metadata (Folder, Scope, Tags)", () => {
    renderEditor();
    expect(screen.getByText("Folder")).toBeInTheDocument();
    expect(screen.getByText("Scope")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
  });

  it("renders the title textarea as editable for page items", () => {
    renderEditor();
    const textarea = screen.getByDisplayValue("Getting Started");
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("renders the novel editor for page kind", () => {
    renderEditor();
    expect(screen.getByTestId("novel-editor")).toBeInTheDocument();
  });

  it("renders archive button", () => {
    renderEditor();
    expect(screen.getByTitle("Archive")).toBeInTheDocument();
  });
});
