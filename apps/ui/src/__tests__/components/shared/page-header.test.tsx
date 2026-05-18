import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

import { PageHeader, PageSection } from "@/components/shared/page-header";

describe("PageHeader", () => {
  it("renders title", () => {
    render(<PageHeader title="Agents" />);
    expect(screen.getByText("Agents")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<PageHeader title="Agents" description="Manage your agents" />);
    expect(screen.getByText("Manage your agents")).toBeInTheDocument();
  });

  it("renders icon slot", () => {
    render(
      <PageHeader
        title="Agents"
        icon={<span data-testid="hdr-icon">IC</span>}
      />
    );
    expect(screen.getByTestId("hdr-icon")).toBeInTheDocument();
  });

  it("renders primary action", () => {
    render(
      <PageHeader
        title="Agents"
        primaryAction={<button>Create</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("renders secondary actions", () => {
    render(
      <PageHeader
        title="Agents"
        secondaryActions={<button>Import</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("renders tabs slot", () => {
    render(
      <PageHeader title="Knowledge" tabs={<div data-testid="tabs">Tab list</div>} />
    );
    expect(screen.getByTestId("tabs")).toBeInTheDocument();
  });

  it("renders meta slot", () => {
    render(
      <PageHeader
        title="Agents"
        meta={<span>5 agents total</span>}
      />
    );
    expect(screen.getByText("5 agents total")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <PageHeader title="X" className="my-extra" />
    );
    expect(container.firstChild).toHaveClass("my-extra");
  });

  it("has bottom border by default", () => {
    const { container } = render(<PageHeader title="X" />);
    expect(container.firstChild).toHaveClass("border-b");
  });

  it("removes border when bordered is false", () => {
    const { container } = render(<PageHeader title="X" bordered={false} />);
    expect(container.firstChild).not.toHaveClass("border-b");
  });
});

describe("PageSection", () => {
  it("renders title and children", () => {
    render(
      <PageSection title="Details">
        <p>Section content</p>
      </PageSection>
    );
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Section content")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(
      <PageSection title="Details" description="Detailed info">
        <p>Content</p>
      </PageSection>
    );
    expect(screen.getByText("Detailed info")).toBeInTheDocument();
  });

  it("renders action slot", () => {
    render(
      <PageSection title="Details" action={<button>Edit</button>}>
        <p>Content</p>
      </PageSection>
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("renders children without title", () => {
    render(
      <PageSection>
        <p>Bare content</p>
      </PageSection>
    );
    expect(screen.getByText("Bare content")).toBeInTheDocument();
  });
});
