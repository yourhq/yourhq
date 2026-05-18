import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuditLogEntry } from "@/lib/audit/types";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { ActivityItem } from "@/components/activity/activity-item";

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "entry-1",
    created_at: "2025-06-01T10:00:00Z",
    actor_type: "human",
    actor_agent_id: null,
    module: "tasks",
    entity_type: "task",
    entity_id: "task-1",
    action: "created",
    summary: "Created a new task",
    changes: null,
    meta: {},
    ...overrides,
  };
}

describe("ActivityItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the summary text", () => {
    render(<ActivityItem entry={makeEntry()} />);
    expect(screen.getByText("Created a new task")).toBeInTheDocument();
  });

  it("shows 'You' for human actor type", () => {
    render(<ActivityItem entry={makeEntry({ actor_type: "human" })} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows agent name for agent actor type", () => {
    render(
      <ActivityItem
        entry={makeEntry({
          actor_type: "agent",
          actor_agent: {
            id: "agent-1",
            name: "Scout",
            slug: "scout",
            avatar_url: null,
          },
        })}
      />,
    );
    expect(screen.getByText("Scout")).toBeInTheDocument();
  });

  it("shows 'System' for system actor type", () => {
    render(
      <ActivityItem entry={makeEntry({ actor_type: "system" })} />,
    );
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("renders the module badge", () => {
    render(<ActivityItem entry={makeEntry({ module: "tasks" })} />);
    expect(screen.getByText("tasks")).toBeInTheDocument();
  });

  it("renders date in expected format", () => {
    render(
      <ActivityItem
        entry={makeEntry({ created_at: "2025-06-01T10:30:00Z" })}
      />,
    );
    expect(screen.getByText(/jun 1/i)).toBeInTheDocument();
  });

  it("navigates to task detail on click", async () => {
    const user = userEvent.setup();
    render(
      <ActivityItem
        entry={makeEntry({ entity_type: "task", entity_id: "task-42" })}
      />,
    );
    await user.click(screen.getByText("Created a new task"));
    expect(mockPush).toHaveBeenCalledWith("/dashboard/tasks?task=task-42");
  });

  it("navigates to contact detail on click", async () => {
    const user = userEvent.setup();
    render(
      <ActivityItem
        entry={makeEntry({
          entity_type: "contact",
          entity_id: "c-1",
          summary: "Updated contact",
        })}
      />,
    );
    await user.click(screen.getByText("Updated contact"));
    expect(mockPush).toHaveBeenCalledWith("/dashboard/contacts/c-1");
  });

  it("navigates to organization detail on click", async () => {
    const user = userEvent.setup();
    render(
      <ActivityItem
        entry={makeEntry({
          entity_type: "organization",
          entity_id: "org-1",
          summary: "Updated org",
        })}
      />,
    );
    await user.click(screen.getByText("Updated org"));
    expect(mockPush).toHaveBeenCalledWith("/dashboard/organizations/org-1");
  });

  it("navigates to agent detail on click", async () => {
    const user = userEvent.setup();
    render(
      <ActivityItem
        entry={makeEntry({
          entity_type: "agent",
          entity_id: "a-1",
          summary: "Agent action",
        })}
      />,
    );
    await user.click(screen.getByText("Agent action"));
    expect(mockPush).toHaveBeenCalledWith("/dashboard/agents/a-1");
  });

  it("navigates to knowledge item on click", async () => {
    const user = userEvent.setup();
    render(
      <ActivityItem
        entry={makeEntry({
          entity_type: "knowledge_item",
          entity_id: "ki-1",
          summary: "Knowledge updated",
        })}
      />,
    );
    await user.click(screen.getByText("Knowledge updated"));
    expect(mockPush).toHaveBeenCalledWith("/dashboard/knowledge/ki-1");
  });

  it("does not navigate for deleted actions", async () => {
    const user = userEvent.setup();
    render(
      <ActivityItem
        entry={makeEntry({ action: "deleted", summary: "Deleted item" })}
      />,
    );
    await user.click(screen.getByText("Deleted item"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("does not navigate for unknown entity types", async () => {
    const user = userEvent.setup();
    render(
      <ActivityItem
        entry={makeEntry({
          entity_type: "unknown_type",
          summary: "Unknown action",
        })}
      />,
    );
    await user.click(screen.getByText("Unknown action"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows fallback text when summary is null", () => {
    render(
      <ActivityItem
        entry={makeEntry({
          summary: null,
          action: "created",
          entity_type: "task",
        })}
      />,
    );
    expect(screen.getByText("created task")).toBeInTheDocument();
  });

  it("renders different module badges with correct module name", () => {
    render(<ActivityItem entry={makeEntry({ module: "crm" })} />);
    expect(screen.getByText("crm")).toBeInTheDocument();
  });

  it("renders agents module badge", () => {
    render(<ActivityItem entry={makeEntry({ module: "agents" })} />);
    expect(screen.getByText("agents")).toBeInTheDocument();
  });

  it("renders knowledge module badge", () => {
    render(<ActivityItem entry={makeEntry({ module: "knowledge" })} />);
    expect(screen.getByText("knowledge")).toBeInTheDocument();
  });
});
