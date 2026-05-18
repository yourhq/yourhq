import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActivityFilters } from "@/components/activity/activity-filters";

function defaultFilters() {
  return {
    moduleFilter: "all",
    setModuleFilter: vi.fn(),
    actorFilter: "all",
    setActorFilter: vi.fn(),
    actionFilter: "all",
    setActionFilter: vi.fn(),
  };
}

function makeFilters(overrides: Partial<ReturnType<typeof defaultFilters>> = {}) {
  return { ...defaultFilters(), ...overrides };
}

describe("ActivityFilters", () => {
  it("renders three filter dropdowns", () => {
    render(<ActivityFilters filters={makeFilters()} />);
    const triggers = screen.getAllByRole("combobox");
    expect(triggers.length).toBe(3);
  });

  it("does not show Clear button when all filters are 'all'", () => {
    render(<ActivityFilters filters={makeFilters()} />);
    expect(screen.queryByText("Clear")).not.toBeInTheDocument();
  });

  it("shows Clear button when module filter is active", () => {
    render(
      <ActivityFilters filters={makeFilters({ moduleFilter: "tasks" })} />,
    );
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("shows Clear button when actor filter is active", () => {
    render(
      <ActivityFilters filters={makeFilters({ actorFilter: "human" })} />,
    );
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("shows Clear button when action filter is active", () => {
    render(
      <ActivityFilters filters={makeFilters({ actionFilter: "created" })} />,
    );
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("calls all reset functions when Clear is clicked", async () => {
    const user = userEvent.setup();
    const filters = makeFilters({ moduleFilter: "tasks" });
    render(<ActivityFilters filters={filters} />);

    await user.click(screen.getByText("Clear"));

    expect(filters.setModuleFilter).toHaveBeenCalledWith("all");
    expect(filters.setActorFilter).toHaveBeenCalledWith("all");
    expect(filters.setActionFilter).toHaveBeenCalledWith("all");
  });

  it("shows Clear when multiple filters are active", () => {
    render(
      <ActivityFilters
        filters={makeFilters({
          moduleFilter: "crm",
          actorFilter: "agent",
        })}
      />,
    );
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("does not show Clear when only default values are set", () => {
    render(
      <ActivityFilters
        filters={makeFilters({
          moduleFilter: "all",
          actorFilter: "all",
          actionFilter: "all",
        })}
      />,
    );
    expect(screen.queryByText("Clear")).not.toBeInTheDocument();
  });
});
