import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

import { HqLogo } from "@/components/shared/hq-logo";

describe("HqLogo", () => {
  it("renders HQ text", () => {
    render(<HqLogo />);
    expect(screen.getByText("HQ")).toBeInTheDocument();
  });

  it("renders logo images", () => {
    render(<HqLogo />);
    const images = screen.getAllByAltText("HQ");
    expect(images.length).toBe(2);
  });

  it("accepts a className prop", () => {
    const { container } = render(<HqLogo className="text-red-500" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("text-red-500");
  });

  it("uses default size of 24", () => {
    render(<HqLogo />);
    const images = screen.getAllByAltText("HQ");
    expect(images[0]).toHaveAttribute("width", "24");
    expect(images[0]).toHaveAttribute("height", "24");
  });

  it("accepts custom size prop", () => {
    render(<HqLogo size={32} />);
    const images = screen.getAllByAltText("HQ");
    expect(images[0]).toHaveAttribute("width", "32");
  });
});
