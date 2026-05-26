import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { TriageItem } from "@/lib/types/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/app/dashboard/actions/triage", () => ({
  approveDeliverable: vi.fn(),
  requestDeliverableRevision: vi.fn(),
  extendTaskDeadline: vi.fn(),
  retryFailedInboxItem: vi.fn(),
  snoozeFollowUp: vi.fn(),
  dismissTriageNotification: vi.fn(),
}));

import { TriageQueue } from "@/app/dashboard/components/triage-queue";

function buildTriageItem(overrides: Partial<TriageItem> = {}): TriageItem {
  return {
    id: "t-1",
    type: "overdue_task",
    title: "Write quarterly report",
    subtitle: "Due 3 days ago",
    href: "/dashboard/tasks?task=t-1",
    urgency: 10,
    timestamp: new Date().toISOString(),
    agentName: "ResearchBot",
    agentEmoji: "🔍",
    entityId: "t-1",
    entityType: "task",
    actions: [
      { key: "view", label: "View", variant: "outline" },
      { key: "extend", label: "Extend", variant: "default" },
    ],
    ...overrides,
  };
}

describe("TriageQueue", () => {
  it("renders empty state when no items", () => {
    render(<TriageQueue initialItems={[]} />);
    expect(
      screen.getByText("All clear — nothing needs your attention"),
    ).toBeInTheDocument();
  });

  it("renders items with title and count badge", () => {
    const items = [
      buildTriageItem({ id: "t-1", title: "Overdue task A" }),
      buildTriageItem({ id: "t-2", title: "Overdue task B" }),
    ];
    render(<TriageQueue initialItems={items} />);
    expect(screen.getByText("Overdue task A")).toBeInTheDocument();
    expect(screen.getByText("Overdue task B")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows header text", () => {
    const items = [buildTriageItem()];
    render(<TriageQueue initialItems={items} />);
    expect(screen.getByText("Needs your input")).toBeInTheDocument();
  });

  it("renders action buttons for each item", () => {
    const items = [
      buildTriageItem({
        actions: [
          { key: "view", label: "View", variant: "outline" },
          { key: "approve", label: "Approve", variant: "default" },
        ],
      }),
    ];
    render(<TriageQueue initialItems={items} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("renders different triage item types", () => {
    const items = [
      buildTriageItem({ id: "t-1", type: "overdue_task", title: "Overdue" }),
      buildTriageItem({ id: "t-2", type: "deliverable_review", title: "Review doc" }),
      buildTriageItem({ id: "t-3", type: "failed_work", title: "Failed import" }),
    ];
    render(<TriageQueue initialItems={items} />);
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Review doc")).toBeInTheDocument();
    expect(screen.getByText("Failed import")).toBeInTheDocument();
  });
});
