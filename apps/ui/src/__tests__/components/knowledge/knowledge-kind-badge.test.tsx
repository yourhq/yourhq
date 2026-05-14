import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KnowledgeKindBadge } from "@/components/knowledge/knowledge-kind-badge";
import type { KnowledgeKind } from "@/lib/knowledge/types";

const KINDS: KnowledgeKind[] = ["page", "skill", "file", "source"];

describe("KnowledgeKindBadge", () => {
  it.each(KINDS)("renders '%s' label", (kind) => {
    render(<KnowledgeKindBadge kind={kind} />);
    expect(screen.getByText(kind)).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <KnowledgeKindBadge kind="page" className="extra-class" />
    );
    expect(container.firstChild).toHaveClass("extra-class");
  });

  it("renders as an inline-flex span", () => {
    const { container } = render(<KnowledgeKindBadge kind="skill" />);
    expect(container.firstChild?.nodeName).toBe("SPAN");
  });
});
