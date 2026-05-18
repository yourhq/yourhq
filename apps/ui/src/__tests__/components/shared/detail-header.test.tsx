import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { DetailHeader } from "@/components/shared/detail-header";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { vi } from "vitest";

describe("DetailHeader", () => {
  const defaults = {
    back: { href: "/dashboard/agents", label: "Agents" },
    identityIcon: <span data-testid="icon">icon</span>,
    identityTitle: "Scout Agent",
  };

  it("renders the back link with label", () => {
    render(<DetailHeader {...defaults} />);
    const link = screen.getByRole("link", { name: /Agents/ });
    expect(link).toHaveAttribute("href", "/dashboard/agents");
  });

  it("renders the identity title", () => {
    render(<DetailHeader {...defaults} />);
    expect(screen.getByText("Scout Agent")).toBeInTheDocument();
  });

  it("renders the identity icon", () => {
    render(<DetailHeader {...defaults} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders identity meta when provided", () => {
    render(
      <DetailHeader
        {...defaults}
        identityMeta={<span>@scout</span>}
      />
    );
    expect(screen.getByText("@scout")).toBeInTheDocument();
  });

  it("does not render meta section when not provided", () => {
    const { container } = render(<DetailHeader {...defaults} />);
    expect(container.querySelector("h1")?.textContent).toBe("Scout Agent");
  });

  it("renders secondary actions", () => {
    render(
      <DetailHeader
        {...defaults}
        secondaryActions={<button>Toggle Rail</button>}
      />
    );
    expect(
      screen.getByRole("button", { name: "Toggle Rail" })
    ).toBeInTheDocument();
  });

  it("renders overflow menu", () => {
    render(
      <DetailHeader
        {...defaults}
        overflow={<button>More</button>}
      />
    );
    expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <DetailHeader {...defaults} className="extra" />
    );
    expect(container.firstChild).toHaveClass("extra");
  });
});
