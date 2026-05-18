import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HqLogo } from "@/components/shared/hq-logo";

describe("HqLogo", () => {
  it("renders an SVG with aria-label", () => {
    render(<HqLogo />);
    const svg = screen.getByLabelText("HQ");
    expect(svg).toBeInTheDocument();
    expect(svg.tagName.toLowerCase()).toBe("svg");
  });

  it("accepts a className prop", () => {
    render(<HqLogo className="text-red-500" />);
    const svg = screen.getByLabelText("HQ");
    expect(svg.className.baseVal).toContain("text-red-500");
  });
});
