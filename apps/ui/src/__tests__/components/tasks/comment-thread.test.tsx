import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Comment } from "@/lib/tasks/types";

vi.mock("./mention-badge", () => ({
  renderMentions: (text: string) => text,
  MentionBadge: ({ mention }: { mention: string }) => <span>{mention}</span>,
}));

vi.mock("@/components/tasks/mention-badge", () => ({
  renderMentions: (text: string) => text,
  MentionBadge: ({ mention }: { mention: string }) => <span>{mention}</span>,
}));

vi.mock("@/components/tasks/comment-form", () => ({
  CommentForm: ({
    onSubmit,
    placeholder,
    onCancel,
    submitLabel,
  }: {
    onSubmit: (body: string) => void;
    placeholder?: string;
    compact?: boolean;
    initialBody?: string;
    onCancel?: () => void;
    submitLabel?: string;
    portal?: boolean;
    enableAttachments?: boolean;
  }) => (
    <div data-testid="comment-form">
      <input
        data-testid="comment-input"
        placeholder={placeholder}
        onChange={() => {}}
      />
      <button
        data-testid="comment-submit"
        onClick={() => onSubmit("Test comment")}
      >
        {submitLabel ?? "Submit"}
      </button>
      {onCancel && (
        <button data-testid="comment-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  ),
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    onCancel,
    title,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <p>{title}</p>
        <button onClick={onConfirm}>Confirm Delete</button>
        <button onClick={onCancel}>Cancel Delete</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({
    children,
  }: {
    children: React.ReactNode;
    align?: string;
    className?: string;
  }) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => <button onClick={onClick}>{children}</button>,
  DropdownMenuTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({
    children,
  }: {
    children: React.ReactNode;
    size?: string;
  }) => <div data-testid="avatar">{children}</div>,
  AvatarImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="avatar-fallback">{children}</div>
  ),
}));

import { CommentThread } from "@/components/tasks/comment-thread";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CommentThread", () => {
  it("renders loading state", () => {
    render(
      <CommentThread
        comments={[]}
        loading={true}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("Comments")).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders Comments heading without count when empty", () => {
    render(
      <CommentThread
        comments={[]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("Comments")).toBeInTheDocument();
    expect(screen.queryByText("(0)")).not.toBeInTheDocument();
  });

  it("renders comment count in heading", () => {
    render(
      <CommentThread
        comments={[makeComment()]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("(1)")).toBeInTheDocument();
  });

  it("renders comment body text", () => {
    render(
      <CommentThread
        comments={[makeComment({ body: "Great work" })]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("Great work")).toBeInTheDocument();
  });

  it("shows 'You' for human actor", () => {
    render(
      <CommentThread
        comments={[makeComment({ actor_type: "human" })]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows agent name for agent actor", () => {
    render(
      <CommentThread
        comments={[
          makeComment({
            actor_type: "agent",
            actor_agent: { id: "a-1", name: "Scout", slug: "scout", avatar_url: null },
          }),
        ]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("Scout")).toBeInTheDocument();
  });

  it("shows 'System' for system actor", () => {
    render(
      <CommentThread
        comments={[makeComment({ actor_type: "system" })]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("shows (edited) label when comment was updated", () => {
    render(
      <CommentThread
        comments={[
          makeComment({
            created_at: "2025-06-01T10:00:00Z",
            updated_at: "2025-06-01T10:05:00Z",
          }),
        ]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("(edited)")).toBeInTheDocument();
  });

  it("does not show (edited) when timestamps are close", () => {
    render(
      <CommentThread
        comments={[
          makeComment({
            created_at: "2025-06-01T10:00:00Z",
            updated_at: "2025-06-01T10:00:00Z",
          }),
        ]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.queryByText("(edited)")).not.toBeInTheDocument();
  });

  it("renders Reply button on each comment", () => {
    render(
      <CommentThread
        comments={[makeComment()]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("Reply")).toBeInTheDocument();
  });

  it("renders nested replies", () => {
    const parent = makeComment({
      id: "c-1",
      body: "Parent comment",
      replies: [
        makeComment({
          id: "c-2",
          body: "Reply comment",
          parent_id: "c-1",
        }),
      ],
    });
    render(
      <CommentThread
        comments={[parent]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("Parent comment")).toBeInTheDocument();
    expect(screen.getByText("Reply comment")).toBeInTheDocument();
  });

  it("renders comment form with appropriate placeholder when empty", () => {
    render(
      <CommentThread
        comments={[]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(
      screen.getByPlaceholderText("Add a comment to start a conversation...")
    ).toBeInTheDocument();
  });

  it("renders comment form with add placeholder when comments exist", () => {
    render(
      <CommentThread
        comments={[makeComment()]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(
      screen.getByPlaceholderText("Add a comment...")
    ).toBeInTheDocument();
  });

  it("calls onAddComment when form is submitted", async () => {
    const user = userEvent.setup();
    const onAddComment = vi.fn();
    render(
      <CommentThread
        comments={[]}
        loading={false}
        onAddComment={onAddComment}
      />
    );
    await user.click(screen.getByTestId("comment-submit"));
    expect(onAddComment).toHaveBeenCalledWith("Test comment");
  });

  it("renders edit/delete options for human comments", () => {
    render(
      <CommentThread
        comments={[makeComment({ actor_type: "human" })]}
        loading={false}
        onAddComment={vi.fn()}
        onEditComment={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    );
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("does not render edit/delete for agent comments", () => {
    render(
      <CommentThread
        comments={[
          makeComment({
            actor_type: "agent",
            actor_agent: { id: "a-1", name: "Bot", slug: "bot", avatar_url: null },
          }),
        ]}
        loading={false}
        onAddComment={vi.fn()}
        onEditComment={vi.fn()}
        onDeleteComment={vi.fn()}
      />
    );
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("renders multiple comments", () => {
    render(
      <CommentThread
        comments={[
          makeComment({ id: "c-1", body: "First" }),
          makeComment({ id: "c-2", body: "Second" }),
        ]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("shows reply form when Reply is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CommentThread
        comments={[makeComment()]}
        loading={false}
        onAddComment={vi.fn()}
      />
    );
    await user.click(screen.getByText("Reply"));
    const forms = screen.getAllByTestId("comment-form");
    expect(forms.length).toBeGreaterThanOrEqual(2);
  });
});
