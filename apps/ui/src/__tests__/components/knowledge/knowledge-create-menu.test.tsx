import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KnowledgeCreateMenu } from "@/components/knowledge/knowledge-create-menu";
import type { SourceConnection } from "@/lib/sources/types";

describe("KnowledgeCreateMenu", () => {
  let onCreatePage: ReturnType<typeof vi.fn>;
  let onCreateSkill: ReturnType<typeof vi.fn>;
  let onUploadFiles: ReturnType<typeof vi.fn>;
  let onPickFromSource: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onCreatePage = vi.fn();
    onCreateSkill = vi.fn();
    onUploadFiles = vi.fn();
    onPickFromSource = vi.fn();
  });

  function renderMenu(sources?: SourceConnection[]) {
    return render(
      <KnowledgeCreateMenu
        onCreatePage={onCreatePage}
        onCreateSkill={onCreateSkill}
        onUploadFiles={onUploadFiles}
        connectedSources={sources}
        onPickFromSource={onPickFromSource}
      />
    );
  }

  it("renders the New button", () => {
    renderMenu();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("shows dropdown options when clicked", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByText("New"));
    expect(screen.getByText("Page")).toBeInTheDocument();
    expect(screen.getByText("Skill")).toBeInTheDocument();
    expect(screen.getByText("Upload files")).toBeInTheDocument();
  });

  it("shows skill subtitle", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByText("New"));
    expect(screen.getByText("Procedures, methods, SOPs")).toBeInTheDocument();
  });

  it("calls onCreatePage when Page is clicked", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByText("New"));
    await user.click(screen.getByText("Page"));
    expect(onCreatePage).toHaveBeenCalledOnce();
  });

  it("calls onCreateSkill when Skill is clicked", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByText("New"));
    await user.click(screen.getByText("Skill"));
    expect(onCreateSkill).toHaveBeenCalledOnce();
  });

  it("calls onUploadFiles when Upload files is clicked", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByText("New"));
    await user.click(screen.getByText("Upload files"));
    expect(onUploadFiles).toHaveBeenCalledOnce();
  });

  it("shows Connect new source link", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByText("New"));
    expect(screen.getByText("Connect new source")).toBeInTheDocument();
  });

  it("shows connected active sources", async () => {
    const user = userEvent.setup();
    const sources: SourceConnection[] = [
      {
        id: "src-1",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        provider: "notion",
        account_label: "My Notion",
        status: "active",
        last_verified_at: null,
        sync_interval_hours: 6,
        next_sync_at: null,
        error_message: null,
        meta: {},
      },
    ];
    renderMenu(sources);
    await user.click(screen.getByText("New"));
    expect(screen.getByText("From My Notion")).toBeInTheDocument();
  });

  it("does not show inactive sources", async () => {
    const user = userEvent.setup();
    const sources: SourceConnection[] = [
      {
        id: "src-1",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        provider: "notion",
        account_label: "Expired Notion",
        status: "expired",
        last_verified_at: null,
        sync_interval_hours: 6,
        next_sync_at: null,
        error_message: null,
        meta: {},
      },
    ];
    renderMenu(sources);
    await user.click(screen.getByText("New"));
    expect(screen.queryByText("From Expired Notion")).not.toBeInTheDocument();
  });

  it("calls onPickFromSource when a source is clicked", async () => {
    const user = userEvent.setup();
    const sources: SourceConnection[] = [
      {
        id: "src-1",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        provider: "notion",
        account_label: "My Notion",
        status: "active",
        last_verified_at: null,
        sync_interval_hours: 6,
        next_sync_at: null,
        error_message: null,
        meta: {},
      },
    ];
    renderMenu(sources);
    await user.click(screen.getByText("New"));
    await user.click(screen.getByText("From My Notion"));
    expect(onPickFromSource).toHaveBeenCalledWith("src-1");
  });
});
