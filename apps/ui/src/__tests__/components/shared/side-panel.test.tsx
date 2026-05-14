import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (o: boolean) => void;
  }) => (open ? <div data-testid="sheet">{children}</div> : null),
  SheetContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    side?: string;
    className?: string;
  }) => (
    <div data-testid="sheet-content" className={className}>
      {children}
    </div>
  ),
  SheetHeader: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div data-testid="sheet-header" className={className}>{children}</div>,
  SheetTitle: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <h2 className={className}>{children}</h2>,
  SheetDescription: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <p className={className}>{children}</p>,
}));

import { SidePanel } from "@/components/shared/side-panel";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SidePanel", () => {
  it("does not render when open is false", () => {
    render(
      <SidePanel open={false} onClose={vi.fn()} title="Edit">
        <div>Panel body</div>
      </SidePanel>
    );
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Panel body")).not.toBeInTheDocument();
  });

  it("renders title and children when open", () => {
    render(
      <SidePanel open={true} onClose={vi.fn()} title="Edit Agent">
        <div>Form content</div>
      </SidePanel>
    );
    expect(screen.getByText("Edit Agent")).toBeInTheDocument();
    expect(screen.getByText("Form content")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <SidePanel
        open={true}
        onClose={vi.fn()}
        title="Edit"
        description="Edit the agent settings"
      >
        <div>Body</div>
      </SidePanel>
    );
    expect(screen.getByText("Edit the agent settings")).toBeInTheDocument();
  });

  it("renders status node when provided", () => {
    render(
      <SidePanel
        open={true}
        onClose={vi.fn()}
        title="Edit"
        status={<span data-testid="status-badge">Active</span>}
      >
        <div>Body</div>
      </SidePanel>
    );
    expect(screen.getByTestId("status-badge")).toBeInTheDocument();
  });

  it("renders footer when provided", () => {
    render(
      <SidePanel
        open={true}
        onClose={vi.fn()}
        title="Edit"
        footer={<button>Save</button>}
      >
        <div>Body</div>
      </SidePanel>
    );
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("does not render footer when not provided", () => {
    render(
      <SidePanel open={true} onClose={vi.fn()} title="Edit">
        <div>Body</div>
      </SidePanel>
    );
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("renders fallback header when title is empty", () => {
    render(
      <SidePanel open={true} onClose={vi.fn()} title="">
        <div>Body</div>
      </SidePanel>
    );
    expect(screen.getByText("Panel")).toBeInTheDocument();
  });
});
