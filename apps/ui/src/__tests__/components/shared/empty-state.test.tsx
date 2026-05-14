import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState } from "@/components/shared/empty-state";
import { Users, Search, FolderOpen } from "lucide-react";

describe("EmptyState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders title and description", () => {
    render(
      <EmptyState
        icon={Users}
        title="No contacts yet"
        description="Add your first contact to get started."
      />
    );
    expect(screen.getByText("No contacts yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first contact to get started.")).toBeInTheDocument();
  });

  it("renders action button when action prop is provided", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={Users}
        title="No contacts"
        description="Get started"
        action={{ label: "Add contact", onClick }}
      />
    );
    expect(screen.getByRole("button", { name: /Add contact/i })).toBeInTheDocument();
  });

  it("calls action.onClick when action button is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={Users}
        title="No contacts"
        description="Get started"
        action={{ label: "Add contact", onClick }}
      />
    );
    await user.click(screen.getByRole("button", { name: /Add contact/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not render action button when action prop is missing", () => {
    render(
      <EmptyState
        icon={Users}
        title="No contacts"
        description="Get started"
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders Clear filters button for filtered variant", () => {
    const onClearFilters = vi.fn();
    render(
      <EmptyState
        icon={Search}
        title="No results"
        description="Try different filters"
        variant="filtered"
        onClearFilters={onClearFilters}
      />
    );
    expect(screen.getByRole("button", { name: /Clear filters/i })).toBeInTheDocument();
  });

  it("calls onClearFilters when Clear filters is clicked", async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    render(
      <EmptyState
        icon={Search}
        title="No results"
        description="Try different filters"
        variant="filtered"
        onClearFilters={onClearFilters}
      />
    );
    await user.click(screen.getByRole("button", { name: /Clear filters/i }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("prefers Clear filters over action in filtered variant", () => {
    const onAction = vi.fn();
    const onClearFilters = vi.fn();
    render(
      <EmptyState
        icon={Search}
        title="No results"
        description="Try different filters"
        variant="filtered"
        onClearFilters={onClearFilters}
        action={{ label: "Add item", onClick: onAction }}
      />
    );
    expect(screen.getByRole("button", { name: /Clear filters/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add item/i })).not.toBeInTheDocument();
  });

  it("renders secondary action when provided", () => {
    const onSecondary = vi.fn();
    render(
      <EmptyState
        icon={Users}
        title="No contacts"
        description="Get started"
        action={{ label: "Add contact", onClick: vi.fn() }}
        secondaryAction={{ label: "Import", onClick: onSecondary }}
      />
    );
    expect(screen.getByRole("button", { name: /Import/i })).toBeInTheDocument();
  });

  it("calls secondaryAction.onClick when clicked", async () => {
    const user = userEvent.setup();
    const onSecondary = vi.fn();
    render(
      <EmptyState
        icon={Users}
        title="No contacts"
        description="Get started"
        action={{ label: "Add contact", onClick: vi.fn() }}
        secondaryAction={{ label: "Import", onClick: onSecondary }}
      />
    );
    await user.click(screen.getByRole("button", { name: /Import/i }));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("applies compact styling when compact prop is true", () => {
    const { container } = render(
      <EmptyState
        icon={Users}
        title="No contacts"
        description="Get started"
        compact
      />
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("py-12");
  });

  it("applies default styling when compact is false", () => {
    const { container } = render(
      <EmptyState
        icon={Users}
        title="No contacts"
        description="Get started"
      />
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("py-20");
  });

  it("applies custom className", () => {
    const { container } = render(
      <EmptyState
        icon={Users}
        title="No contacts"
        description="Get started"
        className="custom-class"
      />
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("custom-class");
  });
});
