import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProviderIcon } from "@/components/connections/provider-icons";

describe("ProviderIcon", () => {
  it("renders an SVG for a known provider (anthropic)", () => {
    const { container } = render(
      <ProviderIcon providerId="anthropic" className="h-4 w-4" />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders an SVG for openai", () => {
    const { container } = render(<ProviderIcon providerId="openai" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders an SVG for google", () => {
    const { container } = render(<ProviderIcon providerId="google" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders an SVG for github-copilot", () => {
    const { container } = render(<ProviderIcon providerId="github-copilot" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders an SVG for ollama", () => {
    const { container } = render(<ProviderIcon providerId="ollama" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders an SVG for deepseek", () => {
    const { container } = render(<ProviderIcon providerId="deepseek" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders the GenericKey fallback for an unknown provider", () => {
    const { container } = render(
      <ProviderIcon providerId="unknown-provider" />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("shares openai icon for openai-codex", () => {
    const { container: c1 } = render(<ProviderIcon providerId="openai" />);
    const { container: c2 } = render(
      <ProviderIcon providerId="openai-codex" />,
    );
    const path1 = c1.querySelector("svg path")?.getAttribute("d");
    const path2 = c2.querySelector("svg path")?.getAttribute("d");
    expect(path1).toBe(path2);
  });

  it("shares google icon for google-gemini-cli", () => {
    const { container: c1 } = render(<ProviderIcon providerId="google" />);
    const { container: c2 } = render(
      <ProviderIcon providerId="google-gemini-cli" />,
    );
    const path1 = c1.querySelector("svg path")?.getAttribute("d");
    const path2 = c2.querySelector("svg path")?.getAttribute("d");
    expect(path1).toBe(path2);
  });

  it("uses ServerLocal icon for lmstudio, vllm, sglang", () => {
    const { container: c1 } = render(<ProviderIcon providerId="lmstudio" />);
    const { container: c2 } = render(<ProviderIcon providerId="vllm" />);
    const { container: c3 } = render(<ProviderIcon providerId="sglang" />);

    const rect1 = c1.querySelector("svg rect");
    const rect2 = c2.querySelector("svg rect");
    const rect3 = c3.querySelector("svg rect");

    expect(rect1).toBeInTheDocument();
    expect(rect2).toBeInTheDocument();
    expect(rect3).toBeInTheDocument();
  });

  it("passes className prop to the SVG", () => {
    const { container } = render(
      <ProviderIcon providerId="anthropic" className="h-8 w-8 text-red" />,
    );
    const svg = container.querySelector("svg");
    const cls = svg?.getAttribute("class") ?? "";
    expect(cls).toContain("h-8");
    expect(cls).toContain("w-8");
  });
});
