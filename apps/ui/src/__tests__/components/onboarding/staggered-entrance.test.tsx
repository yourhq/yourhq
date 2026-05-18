import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { StaggeredEntrance } from "@/components/onboarding/wizard/staggered-entrance";

describe("StaggeredEntrance", () => {
  it("renders children", () => {
    render(
      <StaggeredEntrance index={0}>
        <span>Hello world</span>
      </StaggeredEntrance>,
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("sets animation delay based on index", () => {
    const { container } = render(
      <StaggeredEntrance index={3}>
        <span>Delayed</span>
      </StaggeredEntrance>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.animationDelay).toBe("240ms");
  });

  it("sets animationFillMode to backwards", () => {
    const { container } = render(
      <StaggeredEntrance index={0}>
        <span>Fill</span>
      </StaggeredEntrance>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.animationFillMode).toBe("backwards");
  });

  it("applies custom className", () => {
    const { container } = render(
      <StaggeredEntrance index={0} className="custom-class">
        <span>Styled</span>
      </StaggeredEntrance>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("custom-class");
  });

  it("uses index 0 for 0ms delay", () => {
    const { container } = render(
      <StaggeredEntrance index={0}>
        <span>First</span>
      </StaggeredEntrance>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.animationDelay).toBe("0ms");
  });
});
