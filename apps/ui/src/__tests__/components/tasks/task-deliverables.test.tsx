import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EntityLink } from "@/lib/entity-links/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockActions = {
  approve: vi.fn().mockResolvedValue({ error: null }),
  requestRevision: vi.fn().mockResolvedValue({ error: null }),
  reject: vi.fn().mockResolvedValue({ error: null }),
};

const mockUseDeliverables = vi.fn();

vi.mock("@/hooks/use-deliverables", () => ({
  useDeliverables: (...args: unknown[]) => mockUseDeliverables(...args),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
    variant?: string;
  }) => <span data-testid="badge" className={className}>{children}</span>,
}));

import { TaskDeliverables } from "@/components/tasks/task-deliverables";

function makeDeliverable(overrides: Partial<EntityLink> = {}): EntityLink {
  return {
    id: "d-1",
    created_at: "2025-01-01T00:00:00Z",
    owner_type: "task",
    owner_id: "t-1",
    target_type: "knowledge_item",
    target_id: "ki-1",
    url: null,
    label: "Report",
    sort_order: 0,
    meta: {},
    is_deliverable: true,
    review_status: "draft",
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    submitted_by_agent_id: "a-1",
    submitted_by_agent: { id: "a-1", name: "Scout", slug: "scout" },
    resolved_name: "Weekly Report",
    resolved_icon: undefined,
    resolved_extra: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TaskDeliverables", () => {
  it("renders loading state", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [],
      loading: true,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    expect(screen.getByText("Loading deliverables...")).toBeInTheDocument();
  });

  it("renders nothing when no pending deliverables", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [],
      loading: false,
      actions: mockActions,
    });
    const { container } = render(<TaskDeliverables taskId="t-1" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders deliverable with resolved name and status badge", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable()],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    expect(screen.getByText("Weekly Report")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("shows submitting agent name", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable()],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    expect(screen.getByText("Scout")).toBeInTheDocument();
  });

  it("shows Approved badge for approved deliverables", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable({ review_status: "approved" })],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("shows review buttons for draft deliverables", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable({ review_status: "draft" })],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Request revision")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it("shows review buttons for in_review deliverables", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable({ review_status: "in_review" })],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    expect(screen.getByText("Approve")).toBeInTheDocument();
  });

  it("does not show review buttons for approved deliverables", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable({ review_status: "approved" })],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
  });

  it("calls actions.approve when Approve is clicked", async () => {
    const user = userEvent.setup();
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable()],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    await user.click(screen.getByText("Approve"));
    expect(mockActions.approve).toHaveBeenCalledWith("d-1");
  });

  it("shows revision input when Request revision is clicked", async () => {
    const user = userEvent.setup();
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable()],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    await user.click(screen.getByText("Request revision"));
    expect(
      screen.getByPlaceholderText("What needs to be revised...")
    ).toBeInTheDocument();
  });

  it("shows reject input when Reject is clicked", async () => {
    const user = userEvent.setup();
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable()],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    await user.click(screen.getByText("Reject"));
    expect(
      screen.getByPlaceholderText("Reason for rejection...")
    ).toBeInTheDocument();
  });

  it("submits revision request with note", async () => {
    const user = userEvent.setup();
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable()],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    await user.click(screen.getByText("Request revision"));
    await user.type(
      screen.getByPlaceholderText("What needs to be revised..."),
      "Fix formatting"
    );
    await user.click(screen.getByText("Send"));
    expect(mockActions.requestRevision).toHaveBeenCalledWith(
      "d-1",
      "Fix formatting"
    );
  });

  it("shows review note for revision_requested deliverables", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [
        makeDeliverable({
          review_status: "revision_requested",
          review_note: "Please fix section 3",
        }),
      ],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    expect(screen.getByText(/Please fix section 3/)).toBeInTheDocument();
  });

  it("shows review note for rejected deliverables", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [
        makeDeliverable({
          review_status: "rejected",
          review_note: "Not relevant",
        }),
      ],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    expect(screen.getByText(/Not relevant/)).toBeInTheDocument();
  });

  it("cancels revision input", async () => {
    const user = userEvent.setup();
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable()],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    await user.click(screen.getByText("Request revision"));
    expect(
      screen.getByPlaceholderText("What needs to be revised...")
    ).toBeInTheDocument();
    await user.click(screen.getByText("Cancel"));
    expect(
      screen.queryByPlaceholderText("What needs to be revised...")
    ).not.toBeInTheDocument();
  });

  it("renders multiple deliverables", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [
        makeDeliverable({ id: "d-1", resolved_name: "Report A" }),
        makeDeliverable({ id: "d-2", resolved_name: "Report B" }),
      ],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    expect(screen.getByText("Report A")).toBeInTheDocument();
    expect(screen.getByText("Report B")).toBeInTheDocument();
  });

  it("falls back to label when resolved_name is absent", () => {
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable({ resolved_name: undefined, label: "My Doc" })],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    expect(screen.getByText("My Doc")).toBeInTheDocument();
  });

  it("navigates to knowledge item when clicked", async () => {
    const user = userEvent.setup();
    mockUseDeliverables.mockReturnValue({
      deliverables: [makeDeliverable({ target_type: "knowledge_item", target_id: "ki-123" })],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    await user.click(screen.getByText("Weekly Report"));
    expect(mockPush).toHaveBeenCalledWith("/dashboard/knowledge/ki-123");
  });

  it("opens URL deliverables in new window", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    mockUseDeliverables.mockReturnValue({
      deliverables: [
        makeDeliverable({
          target_type: "url",
          target_id: null,
          url: "https://github.com/pr/1",
          resolved_name: "PR #1",
        }),
      ],
      loading: false,
      actions: mockActions,
    });
    render(<TaskDeliverables taskId="t-1" />);
    await user.click(screen.getByText("PR #1"));
    expect(openSpy).toHaveBeenCalledWith("https://github.com/pr/1", "_blank");
    openSpy.mockRestore();
  });
});
