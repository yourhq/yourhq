import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

describe("LoadingSkeleton", () => {
  it("renders table variant with default row count", () => {
    const { container } = render(<LoadingSkeleton variant="table" />);
    const rows = container.querySelectorAll(".flex.items-center.gap-4");
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });

  it("renders table variant with custom count", () => {
    const { container } = render(
      <LoadingSkeleton variant="table" count={3} />
    );
    const rows = container.querySelectorAll(".flex.items-center.gap-4");
    expect(rows.length).toBe(4);
  });

  it("renders cards variant", () => {
    const { container } = render(<LoadingSkeleton variant="cards" count={4} />);
    const grid = container.querySelector(".grid");
    expect(grid).not.toBeNull();
    expect(grid!.children.length).toBe(4);
  });

  it("renders list variant", () => {
    const { container } = render(<LoadingSkeleton variant="list" count={5} />);
    const rows = container.querySelectorAll(".flex.items-center.gap-3");
    expect(rows.length).toBe(5);
  });

  it("renders feed variant", () => {
    const { container } = render(<LoadingSkeleton variant="feed" count={3} />);
    const rows = container.querySelectorAll(".flex.gap-2\\.5");
    expect(rows.length).toBe(3);
  });

  it("renders detail variant", () => {
    const { container } = render(<LoadingSkeleton variant="detail" />);
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelector(".grid")).not.toBeNull();
  });
});
