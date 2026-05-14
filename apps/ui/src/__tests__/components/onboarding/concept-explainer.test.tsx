import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { ConceptExplainer } from "@/components/onboarding/wizard/concept-explainer";

describe("ConceptExplainer", () => {
  it("renders trigger text", () => {
    render(
      <ConceptExplainer trigger="What is this?">
        <p>Explanation content</p>
      </ConceptExplainer>,
    );
    expect(screen.getByText("What is this?")).toBeInTheDocument();
  });

  it("does not show children by default", () => {
    render(
      <ConceptExplainer trigger="Learn more">
        <p>Hidden details</p>
      </ConceptExplainer>,
    );
    expect(screen.queryByText("Hidden details")).not.toBeInTheDocument();
  });

  it("shows children after clicking the trigger", async () => {
    const user = userEvent.setup();
    render(
      <ConceptExplainer trigger="Learn more">
        <p>Now visible</p>
      </ConceptExplainer>,
    );
    await user.click(screen.getByRole("button", { name: /learn more/i }));
    expect(screen.getByText("Now visible")).toBeInTheDocument();
  });

  it("hides children when clicking trigger a second time", async () => {
    const user = userEvent.setup();
    render(
      <ConceptExplainer trigger="Toggle me">
        <p>Toggleable</p>
      </ConceptExplainer>,
    );
    const btn = screen.getByRole("button", { name: /toggle me/i });
    await user.click(btn);
    expect(screen.getByText("Toggleable")).toBeInTheDocument();
    await user.click(btn);
    expect(screen.queryByText("Toggleable")).not.toBeInTheDocument();
  });

  it("renders the info icon", () => {
    const { container } = render(
      <ConceptExplainer trigger="Info">
        <p>Details</p>
      </ConceptExplainer>,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
