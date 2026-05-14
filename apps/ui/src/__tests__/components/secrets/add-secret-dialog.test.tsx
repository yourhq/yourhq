import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/app/dashboard/settings/secrets/actions", () => ({
  createSecret: vi.fn().mockResolvedValue({ ok: true }),
}));

import { AddSecretDialog } from "@/components/secrets/add-secret-dialog";

describe("AddSecretDialog", () => {
  afterEach(() => cleanup());

  it("renders dialog title and description when open", () => {
    render(
      <AddSecretDialog
        open={true}
        onOpenChange={vi.fn()}
        gatewayId="gw-1"
        onCreated={vi.fn()}
      />
    );
    expect(screen.getByText("Add a secret")).toBeInTheDocument();
    expect(
      screen.getByText(/Encrypted at rest/)
    ).toBeInTheDocument();
  });

  it("renders all form fields", () => {
    render(
      <AddSecretDialog
        open={true}
        onOpenChange={vi.fn()}
        gatewayId="gw-1"
        onCreated={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/What's this for/)).toBeInTheDocument();
    expect(screen.getByLabelText("Variable name")).toBeInTheDocument();
    expect(screen.getByLabelText("Value")).toBeInTheDocument();
  });

  it("disables submit when required fields are empty", () => {
    render(
      <AddSecretDialog
        open={true}
        onOpenChange={vi.fn()}
        gatewayId="gw-1"
        onCreated={vi.fn()}
      />
    );
    const submit = screen.getByRole("button", { name: "Add secret" });
    expect(submit).toBeDisabled();
  });

  it("auto-derives key from name", async () => {
    const user = userEvent.setup();
    render(
      <AddSecretDialog
        open={true}
        onOpenChange={vi.fn()}
        gatewayId="gw-1"
        onCreated={vi.fn()}
      />
    );
    const nameInput = screen.getByLabelText(/What's this for/);
    await user.type(nameInput, "Notion API Key");
    const keyInput = screen.getByLabelText("Variable name") as HTMLInputElement;
    expect(keyInput.value).toBe("NOTION_API_KEY");
  });

  it("shows scope radio when agentId is provided", () => {
    render(
      <AddSecretDialog
        open={true}
        onOpenChange={vi.fn()}
        gatewayId="gw-1"
        agentId="agent-1"
        agentName="Scout"
        onCreated={vi.fn()}
      />
    );
    expect(screen.getByText("All agents on this gateway")).toBeInTheDocument();
    expect(screen.getByText("Only Scout")).toBeInTheDocument();
  });

  it("does not show scope radio when agentId is not provided", () => {
    render(
      <AddSecretDialog
        open={true}
        onOpenChange={vi.fn()}
        gatewayId="gw-1"
        onCreated={vi.fn()}
      />
    );
    expect(
      screen.queryByText("All agents on this gateway")
    ).not.toBeInTheDocument();
  });

  it("renders show/hide value toggle", () => {
    render(
      <AddSecretDialog
        open={true}
        onOpenChange={vi.fn()}
        gatewayId="gw-1"
        onCreated={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Show value" })
    ).toBeInTheDocument();
  });

  it("toggles value visibility", async () => {
    const user = userEvent.setup();
    render(
      <AddSecretDialog
        open={true}
        onOpenChange={vi.fn()}
        gatewayId="gw-1"
        onCreated={vi.fn()}
      />
    );
    const toggle = screen.getByRole("button", { name: "Show value" });
    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: "Hide value" })
    ).toBeInTheDocument();
  });

  it("renders encryption notice", () => {
    render(
      <AddSecretDialog
        open={true}
        onOpenChange={vi.fn()}
        gatewayId="gw-1"
        onCreated={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Never shared with the AI model/)
    ).toBeInTheDocument();
  });

  it("renders cancel button", () => {
    render(
      <AddSecretDialog
        open={true}
        onOpenChange={vi.fn()}
        gatewayId="gw-1"
        onCreated={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Cancel" })
    ).toBeInTheDocument();
  });

  it("uses prefilled key when provided", () => {
    render(
      <AddSecretDialog
        open={true}
        onOpenChange={vi.fn()}
        gatewayId="gw-1"
        prefilledKey="SLACK_TOKEN"
        onCreated={vi.fn()}
      />
    );
    const keyInput = screen.getByLabelText("Variable name") as HTMLInputElement;
    expect(keyInput.value).toBe("SLACK_TOKEN");
  });
});
