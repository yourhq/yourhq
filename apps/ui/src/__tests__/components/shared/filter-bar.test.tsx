import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterBar } from "@/components/shared/filter-bar";

describe("FilterBar", () => {
  it("renders total count with default label", () => {
    render(<FilterBar filters={<span>filters</span>} count={5} />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/items/)).toBeInTheDocument();
  });

  it("renders custom count label", () => {
    render(
      <FilterBar
        filters={<span>filters</span>}
        count={3}
        countLabel="agents"
      />
    );
    expect(screen.getByText(/3 agents/)).toBeInTheDocument();
  });

  it("shows filtered count when count differs from totalCount", () => {
    render(
      <FilterBar
        filters={<span>filters</span>}
        count={2}
        totalCount={10}
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/10/)).toBeInTheDocument();
  });

  it("shows plain count when count equals totalCount", () => {
    render(
      <FilterBar
        filters={<span>filters</span>}
        count={5}
        totalCount={5}
      />
    );
    expect(screen.getByText(/5 items/)).toBeInTheDocument();
  });

  it("renders search slot", () => {
    render(
      <FilterBar
        search={<input placeholder="Search..." />}
        filters={<span>filters</span>}
      />
    );
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("renders filters slot", () => {
    render(<FilterBar filters={<button>Kind: All</button>} />);
    expect(screen.getByRole("button", { name: "Kind: All" })).toBeInTheDocument();
  });

  it("renders actions slot", () => {
    render(
      <FilterBar
        filters={<span>filters</span>}
        actions={<button>New</button>}
      />
    );
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("does not render count when not provided", () => {
    const { container } = render(
      <FilterBar filters={<span>filters</span>} />
    );
    expect(container.querySelector(".tabular-nums")).toBeNull();
  });

  it("applies custom className", () => {
    const { container } = render(
      <FilterBar
        filters={<span>filters</span>}
        className="my-custom-class"
      />
    );
    expect(container.firstChild).toHaveClass("my-custom-class");
  });
});
