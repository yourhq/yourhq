import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AuditLogEntry } from "@/lib/audit/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockFetchActivityStream = vi.fn();
vi.mock("@/app/dashboard/actions/activity", () => ({
  fetchActivityStream: (...args: unknown[]) => mockFetchActivityStream(...args),
}));

import { ActivityStream } from "@/app/dashboard/components/activity-stream";

function buildAuditEntry(
  overrides: Partial<AuditLogEntry> = {},
): AuditLogEntry {
  return {
    id: "ae-1",
    module: "tasks" as AuditLogEntry["module"],
    action: "updated" as AuditLogEntry["action"],
    entity_type: "task",
    entity_id: "task-1",
    actor_type: "agent",
    actor_agent_id: "a-1",
    actor_agent: {
      id: "a-1",
      name: "ResearchBot",
      slug: "researchbot",
      avatar_url: null,
      meta: { emoji: "🔍" },
    },
    summary: "completed task Write quarterly report",
    changes: null,
    created_at: new Date().toISOString(),
    ...overrides,
  } as AuditLogEntry;
}

describe("ActivityStream", () => {
  it("shows loading state initially", () => {
    mockFetchActivityStream.mockReturnValue(new Promise(() => {}));
    render(<ActivityStream />);
    expect(screen.getByText("Activity")).toBeInTheDocument();
  });

  it("shows empty state when no entries", async () => {
    mockFetchActivityStream.mockResolvedValue({ entries: [], hasMore: false });
    render(<ActivityStream />);
    await vi.waitFor(() => {
      expect(screen.getByText("No recent activity.")).toBeInTheDocument();
    });
  });

  it("renders entries grouped by time", async () => {
    const todayEntry = buildAuditEntry({
      id: "ae-1",
      summary: "completed task A",
      created_at: new Date().toISOString(),
    });
    mockFetchActivityStream.mockResolvedValue({
      entries: [todayEntry],
      hasMore: false,
    });
    render(<ActivityStream />);
    await vi.waitFor(() => {
      expect(screen.getByText("Today")).toBeInTheDocument();
      expect(screen.getByText("completed task A")).toBeInTheDocument();
    });
  });

  it("shows load more button when hasMore is true", async () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      buildAuditEntry({ id: `ae-${i}`, summary: `action ${i}` }),
    );
    mockFetchActivityStream.mockResolvedValue({ entries, hasMore: true });
    render(<ActivityStream />);
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /Load more/ })).toBeInTheDocument();
    });
  });

  it("hides load more when all entries loaded", async () => {
    mockFetchActivityStream.mockResolvedValue({
      entries: [buildAuditEntry()],
      hasMore: false,
    });
    render(<ActivityStream />);
    await vi.waitFor(() => {
      expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();
    });
  });

  it("loads more entries on button click", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) =>
      buildAuditEntry({ id: `ae-${i}`, summary: `action ${i}` }),
    );
    mockFetchActivityStream
      .mockResolvedValueOnce({ entries: page1, hasMore: true })
      .mockResolvedValueOnce({
        entries: [buildAuditEntry({ id: "ae-extra", summary: "extra action" })],
        hasMore: false,
      });

    render(<ActivityStream />);
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: /Load more/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Load more/ }));

    await vi.waitFor(() => {
      expect(screen.getByText("extra action")).toBeInTheDocument();
    });
  });
});
