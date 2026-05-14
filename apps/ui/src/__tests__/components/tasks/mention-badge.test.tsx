import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MentionBadge, renderMentions } from "@/components/tasks/mention-badge";

describe("MentionBadge", () => {
  it("renders 'You' for @me mention", () => {
    render(<MentionBadge mention="@me" />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("renders agent slug without @ prefix", () => {
    render(<MentionBadge mention="@scout" />);
    expect(screen.getByText("scout")).toBeInTheDocument();
  });

  it("applies blue styling for @me", () => {
    const { container } = render(<MentionBadge mention="@me" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("blue");
  });

  it("applies purple styling for agent mentions", () => {
    const { container } = render(<MentionBadge mention="@scout" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("purple");
  });

  it("applies custom className", () => {
    const { container } = render(
      <MentionBadge mention="@me" className="extra-class" />
    );
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("extra-class");
  });
});

describe("renderMentions", () => {
  it("returns plain text when no mentions", () => {
    const { container } = render(<>{renderMentions("Hello world")}</>);
    expect(container.textContent).toBe("Hello world");
  });

  it("wraps @me in a MentionBadge", () => {
    render(<>{renderMentions("Hey @me check this")}</>);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("wraps agent mentions in MentionBadge", () => {
    render(<>{renderMentions("Assigned to @scout")}</>);
    expect(screen.getByText("scout")).toBeInTheDocument();
  });

  it("handles multiple mentions", () => {
    render(<>{renderMentions("@me and @scout")}</>);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("scout")).toBeInTheDocument();
  });

  it("handles text with no mentions correctly", () => {
    const { container } = render(<>{renderMentions("No mentions here")}</>);
    expect(container.textContent).toBe("No mentions here");
  });

  it("handles mention at start of string", () => {
    render(<>{renderMentions("@scout is great")}</>);
    expect(screen.getByText("scout")).toBeInTheDocument();
  });

  it("handles mention at end of string", () => {
    render(<>{renderMentions("Assigned to @scout")}</>);
    expect(screen.getByText("scout")).toBeInTheDocument();
  });

  it("handles mentions with hyphens", () => {
    render(<>{renderMentions("Check with @dev-bot")}</>);
    expect(screen.getByText("dev-bot")).toBeInTheDocument();
  });
});
