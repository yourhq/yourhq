import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/onboarding/progress", () => ({
  completeItem: vi.fn(),
}));

import { OpenDesktopModal } from "@/components/gateways/open-desktop-modal";

describe("OpenDesktopModal", () => {
  afterEach(() => cleanup());

  it("renders nothing when open is false", () => {
    const { container } = render(
      <OpenDesktopModal
        open={false}
        onClose={vi.fn()}
        novncUrl="https://gw.example.com/vnc"
        title="Desktop"
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders title when open", () => {
    render(
      <OpenDesktopModal
        open={true}
        onClose={vi.fn()}
        novncUrl="https://gw.example.com/vnc"
        title="Desktop · Home Mac"
      />
    );
    expect(screen.getByText("Desktop · Home Mac")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(
      <OpenDesktopModal
        open={true}
        onClose={vi.fn()}
        novncUrl="https://gw.example.com/vnc"
        title="Desktop"
        subtitle="running on Home Mac"
      />
    );
    expect(screen.getByText(/running on Home Mac/)).toBeInTheDocument();
  });

  it("renders iframe with the novnc URL", () => {
    render(
      <OpenDesktopModal
        open={true}
        onClose={vi.fn()}
        novncUrl="https://gw.example.com/vnc"
        title="Desktop"
      />
    );
    const iframe = screen.getByTitle("Desktop");
    expect(iframe).toHaveAttribute("src", "https://gw.example.com/vnc");
  });

  it("shows fallback message when novncUrl is null", () => {
    render(
      <OpenDesktopModal
        open={true}
        onClose={vi.fn()}
        novncUrl={null}
        title="Desktop"
      />
    );
    expect(
      screen.getByText(/The gateway isn't ready to share its desktop yet/)
    ).toBeInTheDocument();
  });

  it("renders close button", () => {
    render(
      <OpenDesktopModal
        open={true}
        onClose={vi.fn()}
        novncUrl="https://gw.example.com/vnc"
        title="Desktop"
      />
    );
    expect(
      screen.getByRole("button", { name: "Close desktop" })
    ).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <OpenDesktopModal
        open={true}
        onClose={onClose}
        novncUrl="https://gw.example.com/vnc"
        title="Desktop"
      />
    );
    await user.click(screen.getByRole("button", { name: "Close desktop" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders Pop out link when novncUrl is provided", () => {
    render(
      <OpenDesktopModal
        open={true}
        onClose={vi.fn()}
        novncUrl="https://gw.example.com/vnc"
        title="Desktop"
      />
    );
    const popOut = screen.getByText("Pop out");
    expect(popOut.closest("a")).toHaveAttribute(
      "href",
      "https://gw.example.com/vnc"
    );
  });

  it("does not render Pop out link when novncUrl is null", () => {
    render(
      <OpenDesktopModal
        open={true}
        onClose={vi.fn()}
        novncUrl={null}
        title="Desktop"
      />
    );
    expect(screen.queryByText("Pop out")).not.toBeInTheDocument();
  });
});
