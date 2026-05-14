import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SheetContent: ({
    children,
  }: {
    children: React.ReactNode;
    side?: string;
    className?: string;
  }) => <div data-testid="sheet-content">{children}</div>,
  SheetTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
  SheetTitle: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span>{children}</span>,
}));

import {
  DetailSidebar,
  DetailSidebarMobile,
  DetailSidebarSection,
  DetailSidebarPropertyGrid,
  DetailSidebarProperty,
} from "@/components/shared/detail-sidebar";

describe("DetailSidebar", () => {
  it("renders children", () => {
    render(
      <DetailSidebar>
        <div>Section content</div>
      </DetailSidebar>
    );
    expect(screen.getByText("Section content")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <DetailSidebar className="my-sidebar">
        <div>Content</div>
      </DetailSidebar>
    );
    expect(container.querySelector(".my-sidebar")).toBeTruthy();
  });
});

describe("DetailSidebarMobile", () => {
  it("renders trigger button with aria-label", () => {
    render(
      <DetailSidebarMobile title="Details">
        <div>Mobile content</div>
      </DetailSidebarMobile>
    );
    expect(screen.getByLabelText("Open details")).toBeInTheDocument();
  });

  it("renders children in sheet content", () => {
    render(
      <DetailSidebarMobile title="Details">
        <div>Mobile content</div>
      </DetailSidebarMobile>
    );
    expect(screen.getByText("Mobile content")).toBeInTheDocument();
  });

  it("renders title in sr-only span", () => {
    render(
      <DetailSidebarMobile title="Agent Details">
        <div>Content</div>
      </DetailSidebarMobile>
    );
    expect(screen.getByText("Agent Details")).toBeInTheDocument();
  });
});

describe("DetailSidebarSection", () => {
  it("renders title when provided", () => {
    render(
      <DetailSidebarSection title="Usage">
        <div>Section body</div>
      </DetailSidebarSection>
    );
    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.getByText("Section body")).toBeInTheDocument();
  });

  it("renders without title", () => {
    render(
      <DetailSidebarSection>
        <div>No title section</div>
      </DetailSidebarSection>
    );
    expect(screen.getByText("No title section")).toBeInTheDocument();
  });

  it("renders action node when provided", () => {
    render(
      <DetailSidebarSection title="Links" action={<button>Add</button>}>
        <div>Body</div>
      </DetailSidebarSection>
    );
    expect(screen.getByText("Add")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <DetailSidebarSection className="my-section">
        <div>Content</div>
      </DetailSidebarSection>
    );
    expect(container.querySelector(".my-section")).toBeTruthy();
  });
});

describe("DetailSidebarPropertyGrid", () => {
  it("renders children in grid layout", () => {
    render(
      <DetailSidebarPropertyGrid>
        <span>Label</span>
        <span>Value</span>
      </DetailSidebarPropertyGrid>
    );
    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
  });
});

describe("DetailSidebarProperty", () => {
  it("renders label and value", () => {
    render(
      <DetailSidebarPropertyGrid>
        <DetailSidebarProperty label="Status">Active</DetailSidebarProperty>
      </DetailSidebarPropertyGrid>
    );
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});
