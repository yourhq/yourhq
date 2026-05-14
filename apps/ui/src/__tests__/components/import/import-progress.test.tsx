import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ImportResult } from "@/lib/import/types";

vi.mock("@/components/ui/progress", () => ({
  Progress: ({ value }: { value: number }) => (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      {value}%
    </div>
  ),
}));

import { ImportStep } from "@/components/import/import-step";

afterEach(() => {
  cleanup();
});

describe("ImportStep — importing state", () => {
  it("shows progress indicator while importing", () => {
    render(
      <ImportStep
        importing={true}
        progress={45}
        completed={9}
        total={20}
        result={null}
      />
    );

    expect(screen.getByText("Importing...")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows completed / total row count during import", () => {
    render(
      <ImportStep
        importing={true}
        progress={50}
        completed={10}
        total={20}
        result={null}
      />
    );

    expect(screen.getByText("10 / 20 rows")).toBeInTheDocument();
  });

  it("shows progress percentage in progressbar", () => {
    render(
      <ImportStep
        importing={true}
        progress={75}
        completed={15}
        total={20}
        result={null}
      />
    );

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "75");
  });

  it("shows 0% progress at start", () => {
    render(
      <ImportStep
        importing={true}
        progress={0}
        completed={0}
        total={50}
        result={null}
      />
    );

    expect(screen.getByText("0 / 50 rows")).toBeInTheDocument();
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "0");
  });
});

describe("ImportStep — completed with no errors", () => {
  const successResult: ImportResult = {
    created: 25,
    skipped: 3,
    duplicates: 2,
    errored: 0,
    errors: [],
  };

  it("shows Import complete heading", () => {
    render(
      <ImportStep
        importing={false}
        progress={100}
        completed={25}
        total={25}
        result={successResult}
      />
    );

    expect(screen.getByText("Import complete")).toBeInTheDocument();
  });

  it("shows created count", () => {
    render(
      <ImportStep
        importing={false}
        progress={100}
        completed={25}
        total={25}
        result={successResult}
      />
    );

    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("shows skipped count", () => {
    render(
      <ImportStep
        importing={false}
        progress={100}
        completed={25}
        total={25}
        result={successResult}
      />
    );

    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows duplicates count", () => {
    render(
      <ImportStep
        importing={false}
        progress={100}
        completed={25}
        total={25}
        result={successResult}
      />
    );

    expect(screen.getByText("Duplicates")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows errors count as 0", () => {
    render(
      <ImportStep
        importing={false}
        progress={100}
        completed={25}
        total={25}
        result={successResult}
      />
    );

    expect(screen.getByText("Errors")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("does not render error log section when no errors", () => {
    render(
      <ImportStep
        importing={false}
        progress={100}
        completed={25}
        total={25}
        result={successResult}
      />
    );

    expect(screen.queryByText(/errors \(/)).not.toBeInTheDocument();
  });
});

describe("ImportStep — completed with errors", () => {
  const errorResult: ImportResult = {
    created: 18,
    skipped: 0,
    duplicates: 0,
    errored: 4,
    errors: [
      { row: 3, message: "Name is required" },
      { row: 7, message: "Invalid email format" },
      { row: 12, message: "Duplicate entry" },
      { row: 20, message: "Phone number too long" },
    ],
  };

  it("shows error count with destructive styling", () => {
    const { container } = render(
      <ImportStep
        importing={false}
        progress={100}
        completed={18}
        total={22}
        result={errorResult}
      />
    );

    expect(screen.getByText("4")).toBeInTheDocument();
    const errorValue = screen.getByText("4");
    expect(errorValue.className).toContain("text-destructive");
  });

  it("shows error log section with error count", () => {
    render(
      <ImportStep
        importing={false}
        progress={100}
        completed={18}
        total={22}
        result={errorResult}
      />
    );

    expect(screen.getByText("Errors (4)")).toBeInTheDocument();
  });

  it("shows individual error messages with row numbers", () => {
    render(
      <ImportStep
        importing={false}
        progress={100}
        completed={18}
        total={22}
        result={errorResult}
      />
    );

    expect(screen.getByText("Row 3:")).toBeInTheDocument();
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(screen.getByText("Row 7:")).toBeInTheDocument();
    expect(screen.getByText("Invalid email format")).toBeInTheDocument();
    expect(screen.getByText("Row 12:")).toBeInTheDocument();
    expect(screen.getByText("Duplicate entry")).toBeInTheDocument();
    expect(screen.getByText("Row 20:")).toBeInTheDocument();
    expect(screen.getByText("Phone number too long")).toBeInTheDocument();
  });

  it("shows created count alongside errors", () => {
    render(
      <ImportStep
        importing={false}
        progress={100}
        completed={18}
        total={22}
        result={errorResult}
      />
    );

    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
  });
});

describe("ImportStep — null result and not importing", () => {
  it("renders nothing when not importing and no result", () => {
    const { container } = render(
      <ImportStep
        importing={false}
        progress={0}
        completed={0}
        total={0}
        result={null}
      />
    );

    expect(container.innerHTML).toBe("");
  });
});
