import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Comment } from "@/lib/tasks/types";
import type { AuditLogEntry } from "@/lib/audit/types";

vi.mock("@/hooks/use-comments", () => ({
  useComments: vi.fn(),
}));

vi.mock("@/hooks/use-audit-log", () => ({
  useEntityAuditLog: vi.fn(),
}));

vi.mock("@/components/tasks/comment-form", () => ({
  CommentForm: ({
    placeholder,
    onSubmit,
  }: {
    placeholder?: string;
    onSubmit?: (body: string) => void;
    compact?: boolean;
    initialBody?: string;
    onCancel?: () => void;
    submitLabel?: string;
    portal?: boolean;
    enableAttachments?: boolean;
    showMentionHint?: boolean;
  }) => (
    <div data-testid="comment-form">
      {placeholder && <span data-testid="comment-placeholder">{placeholder}</span>}
      {onSubmit && (
        <button data-testid="comment-submit" onClick={() => onSubmit("test")}>
          Submit
        </button>
      )}
    </div>
  ),
}));

vi.mock("@/components/tasks/mention-badge", () => ({
  renderMentions: (text: string) => text,
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode; align?: string; className?: string }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode; size?: string }) => (
    <div data-testid="avatar">{children}</div>
  ),
  AvatarImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="avatar-fallback">{children}</div>
  ),
}));

vi.mock("date-fns", () => ({
  format: (date: Date) => date.toISOString().slice(0, 10),
  formatDistanceToNow: () => "1 hour ago",
}));

import { useComments } from "@/hooks/use-comments";
import { useEntityAuditLog } from "@/hooks/use-audit-log";
import { TaskTimeline } from "@/components/tasks/task-timeline";

const mockUseComments = useComments as ReturnType<typeof vi.fn>;
const mockUseEntityAuditLog = useEntityAuditLog as ReturnType<typeof vi.fn>;

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c-1",
    created_at: "2025-06-01T10:00:00Z",
    updated_at: "2025-06-01T10:00:00Z",
    entity_type: "task",
    entity_id: "t-1",
    parent_id: null,
    actor_type: "human",
    actor_agent_id: null,
    body: "This looks good",
    mentions: [],
    meta: {},
    actor_agent: null,
    replies: [],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "e-1",
    created_at: "2025-06-01T09:00:00Z",
    actor_type: "human",
    actor_agent_id: null,
    module: "tasks",
    entity_type: "task",
    entity_id: "t-1",
    action: "created",
    summary: "Task created",
    changes: null,
    meta: {},
    actor_agent: null,
    ...overrides,
  };
}

function setup({
  comments = [] as Comment[],
  commentsLoading = false,
  entries = [] as AuditLogEntry[],
  activityLoading = false,
} = {}) {
  const actions = {
    addComment: vi.fn(),
    editComment: vi.fn(),
    deleteComment: vi.fn(),
  };
  mockUseComments.mockReturnValue({ comments, loading: commentsLoading, actions });
  mockUseEntityAuditLog.mockReturnValue({ entries, loading: activityLoading });
  return { actions };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TaskTimeline", () => {
  it("renders Timeline header", () => {
    setup();
    render(<TaskTimeline taskId="t-1" />);
    expect(screen.getByText("Timeline")).toBeInTheDocument();
  });

  it("shows loading state when comments loading", () => {
    setup({ commentsLoading: true });
    render(<TaskTimeline taskId="t-1" />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows loading state when activity loading", () => {
    setup({ activityLoading: true });
    render(<TaskTimeline taskId="t-1" />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows 'No activity yet' when both empty", () => {
    setup();
    render(<TaskTimeline taskId="t-1" />);
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  it("renders comment with actor name and body", () => {
    setup({ comments: [makeComment({ body: "Great work" })] });
    render(<TaskTimeline taskId="t-1" />);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Great work")).toBeInTheDocument();
  });

  it("renders agent comment with agent name", () => {
    setup({
      comments: [
        makeComment({
          id: "c-2",
          actor_type: "agent",
          actor_agent: { id: "a-1", name: "Scout", slug: "scout", avatar_url: null, meta: { emoji: "🤖" } },
          body: "Agent report",
        }),
      ],
    });
    render(<TaskTimeline taskId="t-1" />);
    expect(screen.getByText("Scout")).toBeInTheDocument();
    expect(screen.getByText("Agent report")).toBeInTheDocument();
  });

  it("renders activity entry with summary", () => {
    setup({ entries: [makeEntry({ summary: "Status changed to in_progress" })] });
    render(<TaskTimeline taskId="t-1" />);
    expect(screen.getByText("Status changed to in_progress")).toBeInTheDocument();
  });

  it("timeline items sorted chronologically", () => {
    const laterComment = makeComment({
      id: "c-later",
      body: "Later comment",
      created_at: "2025-06-01T12:00:00Z",
    });
    const earlierEntry = makeEntry({
      id: "e-earlier",
      summary: "Earlier activity",
      created_at: "2025-06-01T08:00:00Z",
    });
    setup({ comments: [laterComment], entries: [earlierEntry] });
    render(<TaskTimeline taskId="t-1" />);

    const activityText = screen.getByText("Earlier activity");
    const commentText = screen.getByText("Later comment");

    const container = activityText.closest(".space-y-2")!;
    const allTexts = within(container).getAllByText(/.+/);
    const activityIndex = allTexts.findIndex((el) => el.textContent === "Earlier activity");
    const commentIndex = allTexts.findIndex((el) => el.textContent === "Later comment");
    expect(activityIndex).toBeLessThan(commentIndex);
  });

  it("activity toggle button exists", () => {
    setup();
    render(<TaskTimeline taskId="t-1" />);
    expect(screen.getByRole("button", { name: /activity/i })).toBeInTheDocument();
  });

  it("comment form rendered at bottom", () => {
    setup();
    render(<TaskTimeline taskId="t-1" />);
    const forms = screen.getAllByTestId("comment-form");
    expect(forms.length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText("Add a comment... use @ to notify an agent")
    ).toBeInTheDocument();
  });

  it("shows attachment icons for comments with attachments", () => {
    setup({
      comments: [
        makeComment({
          id: "c-att",
          body: "See attached",
          meta: {
            attachments: [
              { entity_type: "knowledge_item", label: "Design spec" },
              { entity_type: "url", label: "Reference link", url: "https://example.com" },
            ],
          },
        }),
      ],
    });
    render(<TaskTimeline taskId="t-1" />);
    expect(screen.getByText("Design spec")).toBeInTheDocument();
    expect(screen.getByText("Reference link")).toBeInTheDocument();
  });

  it("shows '(edited)' label for edited comments", () => {
    setup({
      comments: [
        makeComment({
          id: "c-edit",
          body: "Updated text",
          created_at: "2025-06-01T10:00:00Z",
          updated_at: "2025-06-01T10:05:00Z",
        }),
      ],
    });
    render(<TaskTimeline taskId="t-1" />);
    expect(screen.getByText("(edited)")).toBeInTheDocument();
  });
});
