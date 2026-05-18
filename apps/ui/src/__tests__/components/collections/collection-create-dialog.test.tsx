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

  it("renders pick step with template cards", () => {
    renderDialog();
    expect(screen.getByText("Start from scratch")).toBeInTheDocument();
    expect(screen.getByText("Project Tracker")).toBeInTheDocument();
    expect(screen.getByText("Bug Tracker")).toBeInTheDocument();
  });

  it("renders template description when available", () => {
    renderDialog();
    expect(screen.getByText("Track your projects")).toBeInTheDocument();
  });

  it("renders pick step description", () => {
    renderDialog();
    expect(screen.getByText("Track anything with custom fields and views.")).toBeInTheDocument();
  });

  it("renders blank card on pick step", () => {
    renderDialog();
    expect(screen.getByText("Start from scratch")).toBeInTheDocument();
    expect(screen.getByText("Empty collection with custom fields")).toBeInTheDocument();
  });

  it("navigates to name step and calls onInstallTemplate when template is picked", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Project Tracker"));
    const input = screen.getByPlaceholderText("Project Tracker");
    expect(input).toHaveValue("Project Tracker");
    await user.click(screen.getByText("Create"));
    expect(onInstallTemplate).toHaveBeenCalledWith(templates[0]);
  });

  it("navigates to name step when blank card is clicked", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Start from scratch"));
    expect(screen.getByPlaceholderText("e.g. Job Applications")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("shows back button on name step that returns to pick step", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Start from scratch"));
    expect(screen.getByText("Blank Collection")).toBeInTheDocument();
    await user.click(screen.getByText("Blank Collection"));
    expect(screen.getByText("New Collection")).toBeInTheDocument();
  });

  it("Create button is disabled when name is empty", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Start from scratch"));
    expect(screen.getByText("Create")).toBeDisabled();
  });

  it("calls onCreateBlank with form data", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByText("Start from scratch"));
    await user.type(screen.getByPlaceholderText("e.g. Job Applications"), "Deals");
    await user.click(screen.getByText("Create"));
    expect(onCreateBlank).toHaveBeenCalledWith({
      name: "Deals",
      slug: "deals",
    });
  });

  it("renders pick step even with no templates", () => {
    renderDialog(true, []);
    expect(screen.getByText("New Collection")).toBeInTheDocument();
    expect(screen.getByText("Start from scratch")).toBeInTheDocument();
  });
});
