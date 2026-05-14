import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/sources/generated-manifests", () => ({
  PROVIDER_MANIFESTS: {
    notion: {
      id: "notion",
      name: "Notion",
      description: "Sync pages and databases",
      icon: "N",
      auth: { type: "api_key", fields: [], setup_steps: [] },
      supports_write: false,
    },
  },
}));

import { ProviderIcon } from "@/components/sources/provider-icon";

describe("ProviderIcon", () => {
  it("renders the manifest icon for a known provider", () => {
    render(<ProviderIcon provider="notion" />);
    const span = screen.getByTitle("Notion");
    expect(span).toBeInTheDocument();
    expect(span).toHaveTextContent("N");
  });

  it("renders a fallback Globe icon for an unknown provider", () => {
    const { container } = render(<ProviderIcon provider="unknown-thing" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(screen.queryByTitle("Notion")).not.toBeInTheDocument();
  });

  it("passes className to the known provider icon", () => {
    render(<ProviderIcon provider="notion" className="h-5 w-5" />);
    const span = screen.getByTitle("Notion");
    expect(span.className).toContain("h-5 w-5");
  });

  it("passes className to the fallback Globe icon", () => {
    const { container } = render(
      <ProviderIcon provider="nope" className="h-6 w-6" />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.className.baseVal || svg?.getAttribute("class") || "").toContain("h-6 w-6");
  });
});
