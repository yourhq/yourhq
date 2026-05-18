import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ───────────────────────────────────────────────────────────

let fetchMockImpl: (url: string) => Promise<Response>;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMockImpl = vi.fn().mockRejectedValue(new Error("Not mocked"));
  globalThis.fetch = vi.fn((url: string | URL | Request) =>
    fetchMockImpl(typeof url === "string" ? url : url.toString())
  ) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Mock URL.createObjectURL / revokeObjectURL
const mockCreateObjectURL = vi.fn().mockReturnValue("blob:screenshot");
const mockRevokeObjectURL = vi.fn();
globalThis.URL.createObjectURL = mockCreateObjectURL;
globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

import { AgentBrowserTab } from "@/components/agents/agent-browser-tab";

// ── Helpers ─────────────────────────────────────────────────────────

function makeSuccessfulFetch() {
  fetchMockImpl = (url: string) => {
    if (url.includes("/state")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            url: "https://example.com",
            title: "Example",
            tabs: [{ id: "1", url: "https://example.com", title: "Example" }],
          }),
          { status: 200 }
        )
      );
    }
    if (url.includes("/screenshot")) {
      return Promise.resolve(
        new Response(new Blob(["png-data"], { type: "image/png" }), {
          status: 200,
        })
      );
    }
    return Promise.reject(new Error("Unknown URL"));
  };
}

function makeFailingFetch() {
  fetchMockImpl = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "Gateway unreachable" }), {
        status: 502,
      })
    );
}

describe("AgentBrowserTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders loading state initially", () => {
    makeFailingFetch();
    render(<AgentBrowserTab slug="scout" />);
    expect(screen.getByText("Connecting to browser…")).toBeInTheDocument();
  });

  it("shows error message on repeated fetch failure", async () => {
    makeFailingFetch();
    render(<AgentBrowserTab slug="scout" />);

    // Advance past multiple poll intervals to trigger MAX_CONSECUTIVE_ERRORS
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }

    await waitFor(() => {
      expect(screen.getByText("Gateway unreachable")).toBeInTheDocument();
    });
  });

  it("renders screenshot on success", async () => {
    makeSuccessfulFetch();
    render(<AgentBrowserTab slug="scout" />);

    await waitFor(() => {
      const img = screen.getByAltText("Agent browser");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "blob:screenshot");
    });
  });

  it("shows current URL in address bar", async () => {
    makeSuccessfulFetch();
    render(<AgentBrowserTab slug="scout" />);

    await waitFor(() => {
      expect(screen.getByText("https://example.com")).toBeInTheDocument();
    });
  });

  it("pause button toggles polling indicator", async () => {
    makeSuccessfulFetch();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AgentBrowserTab slug="scout" />);

    await waitFor(() => {
      expect(screen.getByAltText("Agent browser")).toBeInTheDocument();
    });

    const pauseBtn = screen.getByTitle("Pause streaming");
    await user.click(pauseBtn);
    expect(screen.getByTitle("Resume streaming")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });
});
