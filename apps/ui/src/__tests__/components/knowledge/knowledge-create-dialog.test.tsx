import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KnowledgeCreateDialog } from "@/components/knowledge/knowledge-create-dialog";

vi.mock("@/components/ui/responsive-dialog", () => ({
  ResponsiveDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  ResponsiveDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

describe("KnowledgeCreateDialog", () => {
  let onSave: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn();
    onCancel = vi.fn();
  });

  it("renders dialog title for page kind", () => {
    render(
      <KnowledgeCreateDialog kind="page" folderId={null} onSave={onSave} onCancel={onCancel} />
    );
    expect(screen.getByText("New Page")).toBeInTheDocument();
  });

  it("renders dialog title for skill kind", () => {
    render(
      <KnowledgeCreateDialog kind="skill" folderId={null} onSave={onSave} onCancel={onCancel} />
    );
    expect(screen.getByText("New Skill")).toBeInTheDocument();
  });

  it("renders title input with correct placeholder for page", () => {
    render(
      <KnowledgeCreateDialog kind="page" folderId={null} onSave={onSave} onCancel={onCancel} />
    );
    expect(screen.getByPlaceholderText("Page title...")).toBeInTheDocument();
  });

  it("renders title input with correct placeholder for skill", () => {
    render(
      <KnowledgeCreateDialog kind="skill" folderId={null} onSave={onSave} onCancel={onCancel} />
    );
    expect(screen.getByPlaceholderText("Skill title...")).toBeInTheDocument();
  });

  it("renders Cancel and Create buttons", () => {
    render(
      <KnowledgeCreateDialog kind="page" folderId={null} onSave={onSave} onCancel={onCancel} />
    );
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("Create button is disabled when title is empty", () => {
    render(
      <KnowledgeCreateDialog kind="page" folderId={null} onSave={onSave} onCancel={onCancel} />
    );
    expect(screen.getByText("Create")).toBeDisabled();
  });

  it("calls onSave with title and kind when Create is clicked", async () => {
    const user = userEvent.setup();
    render(
      <KnowledgeCreateDialog kind="page" folderId={null} onSave={onSave} onCancel={onCancel} />
    );
    await user.type(screen.getByPlaceholderText("Page title..."), "My New Page");
    await user.click(screen.getByText("Create"));
    expect(onSave).toHaveBeenCalledWith("My New Page", "page");
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(
      <KnowledgeCreateDialog kind="page" folderId={null} onSave={onSave} onCancel={onCancel} />
    );
    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("trims whitespace from title before saving", async () => {
    const user = userEvent.setup();
    render(
      <KnowledgeCreateDialog kind="skill" folderId={null} onSave={onSave} onCancel={onCancel} />
    );
    await user.type(screen.getByPlaceholderText("Skill title..."), "  My Skill  ");
    await user.click(screen.getByText("Create"));
    expect(onSave).toHaveBeenCalledWith("My Skill", "skill");
  });

  it("does not call onSave when title is only whitespace", async () => {
    const user = userEvent.setup();
    render(
      <KnowledgeCreateDialog kind="page" folderId={null} onSave={onSave} onCancel={onCancel} />
    );
    await user.type(screen.getByPlaceholderText("Page title..."), "   ");
    await user.click(screen.getByText("Create"));
    expect(onSave).not.toHaveBeenCalled();
  });
});
