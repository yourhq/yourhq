import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionCreateDialog } from "@/components/collections/collection-create-dialog";
import type { CollectionTemplate } from "@/lib/collections/types";

vi.mock("@/components/ui/responsive-dialog", () => ({
  ResponsiveDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  ResponsiveDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  ResponsiveDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const templates: CollectionTemplate[] = [
  {
    id: "tpl-1",
    created_at: "2024-01-01T00:00:00Z",
    name: "Project Tracker",
    slug: "project-tracker",
    description: "Track your projects",
    icon: "📋",
    category: "productivity",
    definition: {
      fields: [],
      views: [{ name: "Default", view_type: "table", is_default: true, config: {} }],
    },
    sort_order: 0,
  },
  {
    id: "tpl-2",
    created_at: "2024-01-01T00:00:00Z",
    name: "Bug Tracker",
    slug: "bug-tracker",
    description: null,
    icon: null,
    category: null,
    definition: {
      fields: [],
      views: [{ name: "Default", view_type: "table", is_default: true, config: {} }],
    },
    sort_order: 1,
  },
];

describe("CollectionCreateDialog", () => {
  let onClose: ReturnType<typeof vi.fn>;
  let onCreateBlank: ReturnType<typeof vi.fn>;
  let onInstallTemplate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClose = vi.fn();
    onCreateBlank = vi.fn().mockResolvedValue({});
    onInstallTemplate = vi.fn().mockResolvedValue({});
  });

  function renderDialog(open = true, tpls = templates) {
    return render(
      <CollectionCreateDialog
        open={open}
        onClose={onClose}
        templates={tpls}
        onCreateBlank={onCreateBlank}
        onInstallTemplate={onInstallTemplate}
      />
    );
  }

  it("renders nothing when closed", () => {
    const { container } = renderDialog(false);
    expect(container.querySelector("[data-testid='dialog']")).not.toBeInTheDocument();
  });

  it("renders dialog title", () => {
    renderDialog();
    expect(screen.getByText("New Collection")).toBeInTheDocument();
  });

  it("renders template tab with templates", () => {
    renderDialog();
    expect(screen.getByText("Templates")).toBeInTheDocument();
    expect(screen.getByText("Project Tracker")).toBeInTheDocument();
    expect(screen.getByText("Bug Tracker")).toBeInTheDocument();
  });

  it("renders template description when available", () => {
    renderDialog();
    expect(screen.getByText("Track your projects")).toBeInTheDocument();
  });

  it("renders template icons", () => {
    renderDialog();
    const icons = screen.getAllByText("📋");
    expect(icons.length).toBe(2);
  });

  it("renders Blank tab", () => {
    renderDialog();
    expect(screen.getByText("Blank")).toBeInTheDocument();
  });

  it("calls onInstallTemplate when a template is clicked", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Project Tracker"));
    expect(onInstallTemplate).toHaveBeenCalledWith(templates[0]);
  });

  it("renders blank form fields when Blank tab is selected", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Blank"));
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Slug")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
  });

  it("auto-generates slug from name", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Blank"));
    const nameInput = screen.getByPlaceholderText("e.g. Job Applications");
    await user.type(nameInput, "My Collection");
    const slugInput = screen.getByPlaceholderText("job-applications");
    expect(slugInput).toHaveValue("my-collection");
  });

  it("Create button is disabled when name is empty", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Blank"));
    expect(screen.getByText("Create Collection")).toBeDisabled();
  });

  it("calls onCreateBlank with form data", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Blank"));
    await user.type(screen.getByPlaceholderText("e.g. Job Applications"), "Deals");
    await user.click(screen.getByText("Create Collection"));
    expect(onCreateBlank).toHaveBeenCalledWith({
      name: "Deals",
      slug: "deals",
      description: undefined,
    });
  });

  it("defaults to blank tab when no templates provided", () => {
    renderDialog(true, []);
    expect(screen.queryByText("Templates")).not.toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
  });
});
