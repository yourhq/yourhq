import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

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

vi.mock("./add-workspace-dialog", () => ({
  AddWorkspaceDialog: () => null,
}));

import {
  WorkspaceSwitcher,
  type SwitcherWorkspace,
} from "@/components/workspaces/workspace-switcher";

function makeWorkspace(overrides: Partial<SwitcherWorkspace> = {}): SwitcherWorkspace {
  return {
    id: "ws-1",
    label: "My Workspace",
    emoji: "🏠",
    ...overrides,
  };
}

describe("WorkspaceSwitcher", () => {
  afterEach(() => cleanup());

  it("renders fallback HQ label when no workspaces", () => {
    render(
      <WorkspaceSwitcher activeWorkspaceId={null} workspaces={[]} />
    );
    expect(screen.getByText("HQ")).toBeInTheDocument();
  });

  it("renders single workspace as static label (no dropdown)", () => {
    const ws = makeWorkspace();
    render(
      <WorkspaceSwitcher activeWorkspaceId="ws-1" workspaces={[ws]} />
    );
    expect(screen.getByText("My Workspace")).toBeInTheDocument();
    expect(screen.getByText("🏠")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Switch workspace/ })
    ).not.toBeInTheDocument();
  });

  it("renders dropdown trigger when multiple workspaces", () => {
    const workspaces = [
      makeWorkspace({ id: "ws-1", label: "Work" }),
      makeWorkspace({ id: "ws-2", label: "Personal" }),
    ];
    render(
      <WorkspaceSwitcher activeWorkspaceId="ws-1" workspaces={workspaces} />
    );
    expect(
      screen.getByRole("button", { name: /Switch workspace — currently Work/ })
    ).toBeInTheDocument();
  });

  it("shows active workspace label and emoji", () => {
    const workspaces = [
      makeWorkspace({ id: "ws-1", label: "Work", emoji: "💼" }),
      makeWorkspace({ id: "ws-2", label: "Personal", emoji: "🏡" }),
    ];
    render(
      <WorkspaceSwitcher activeWorkspaceId="ws-1" workspaces={workspaces} />
    );
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("💼")).toBeInTheDocument();
  });

  it("hides labels when showLabels is false", () => {
    const ws = makeWorkspace({ label: "Hidden Label" });
    render(
      <WorkspaceSwitcher
        activeWorkspaceId="ws-1"
        workspaces={[ws]}
        showLabels={false}
      />
    );
    expect(screen.queryByText("Hidden Label")).not.toBeInTheDocument();
    expect(screen.getByText("🏠")).toBeInTheDocument();
  });

  it("falls back to first workspace when active not found", () => {
    const workspaces = [
      makeWorkspace({ id: "ws-1", label: "First" }),
      makeWorkspace({ id: "ws-2", label: "Second" }),
    ];
    render(
      <WorkspaceSwitcher
        activeWorkspaceId="ws-nonexistent"
        workspaces={workspaces}
      />
    );
    expect(screen.getByText("First")).toBeInTheDocument();
  });

  it("renders fallback emoji when no workspaces exist", () => {
    render(
      <WorkspaceSwitcher activeWorkspaceId={null} workspaces={[]} />
    );
    expect(screen.getByText("🏠")).toBeInTheDocument();
  });
});
