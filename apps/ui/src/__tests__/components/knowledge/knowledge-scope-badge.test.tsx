import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KnowledgeScopeBadge } from "@/components/knowledge/knowledge-scope-badge";

describe("KnowledgeScopeBadge", () => {
  it("renders 'Workspace' for workspace scope", () => {
    render(<KnowledgeScopeBadge scope="workspace" />);
    expect(screen.getByText("Workspace")).toBeInTheDocument();
  });

  it("renders 'Agent' for agent scope", () => {
    render(<KnowledgeScopeBadge scope="agent" />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("applies custom className to workspace badge", () => {
    const { container } = render(
      <KnowledgeScopeBadge scope="workspace" className="my-class" />
    );
    expect(container.firstChild).toHaveClass("my-class");
  });

  it("applies custom className to agent badge", () => {
    const { container } = render(
      <KnowledgeScopeBadge scope="agent" className="my-class" />
    );
    expect(container.firstChild).toHaveClass("my-class");
  });
});
