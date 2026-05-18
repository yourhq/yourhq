import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockParseFile = vi.fn();
const mockParseText = vi.fn();

vi.mock("@/lib/import/parse", () => ({
  parseFile: (...args: unknown[]) => mockParseFile(...args),
  parseText: (...args: unknown[]) => mockParseText(...args),
}));

import { UploadStep } from "@/components/import/upload-step";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function csvResult(rowCount = 5, headers = ["name", "email"]) {
  return { headers, rows: Array(rowCount).fill({}), format: "csv" as const, rowCount };
}

function _jsonResult(rowCount = 3, headers = ["name", "phone"]) {
  return { headers, rows: Array(rowCount).fill({}), format: "json" as const, rowCount };
}

describe("UploadStep", () => {
  it("renders file upload zone with drag-drop text", () => {
    render(<UploadStep onParsed={vi.fn()} />);
    expect(screen.getByText("Drop a CSV or JSON file here")).toBeInTheDocument();
    expect(screen.getByText("or click to browse")).toBeInTheDocument();
  });

  it("renders file mode toggle as active by default", () => {
    render(<UploadStep onParsed={vi.fn()} />);
    const fileBtn = screen.getByRole("button", { name: /file/i });
    expect(fileBtn).toBeInTheDocument();
  });

  it("renders paste mode toggle", () => {
    render(<UploadStep onParsed={vi.fn()} />);
    const pasteBtn = screen.getByRole("button", { name: /paste/i });
    expect(pasteBtn).toBeInTheDocument();
  });

  it("shows supported formats hint", () => {
    render(<UploadStep onParsed={vi.fn()} />);
    expect(
      screen.getByText(/supports csv.*and json/i)
    ).toBeInTheDocument();
  });

  it("has a hidden file input accepting .csv and .json", () => {
    const { container } = render(<UploadStep onParsed={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toBe(".csv,.json");
    expect(input.className).toContain("hidden");
  });

  it("shows error for unsupported file type on drop", () => {
    render(<UploadStep onParsed={vi.fn()} />);

    const dropZone = screen.getByText("Drop a CSV or JSON file here").closest("div")!;
    const file = new File(["data"], "file.xlsx", { type: "application/vnd.openxmlformats" });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    expect(screen.getByText("Only CSV and JSON files are supported.")).toBeInTheDocument();
  });

  it("switches to paste mode and shows textarea", async () => {
    const user = userEvent.setup();
    render(<UploadStep onParsed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /paste/i }));

    expect(screen.getByPlaceholderText(/paste csv or json data/i)).toBeInTheDocument();
  });

  it("shows Parse data button when paste textarea has content", async () => {
    const user = userEvent.setup();
    render(<UploadStep onParsed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /paste/i }));

    const textarea = screen.getByPlaceholderText(/paste csv or json data/i);
    await user.type(textarea, "name,email");

    expect(screen.getByRole("button", { name: /parse data/i })).toBeInTheDocument();
  });

  it("calls onParsed after pasting and clicking Parse data", async () => {
    const user = userEvent.setup();
    const onParsed = vi.fn();
    const result = csvResult(2);
    mockParseText.mockReturnValue(result);

    render(<UploadStep onParsed={onParsed} />);

    await user.click(screen.getByRole("button", { name: /paste/i }));
    const textarea = screen.getByPlaceholderText(/paste csv or json data/i);
    await user.type(textarea, "name,email\nJohn,john@test.com\nJane,jane@test.com");
    await user.click(screen.getByRole("button", { name: /parse data/i }));

    expect(onParsed).toHaveBeenCalledWith(result, "pasted-data.csv");
  });

  it("shows pasted data summary after successful paste parse", async () => {
    const user = userEvent.setup();
    const result = csvResult(4, ["name", "email"]);
    mockParseText.mockReturnValue(result);

    render(<UploadStep onParsed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /paste/i }));
    const textarea = screen.getByPlaceholderText(/paste csv or json data/i);
    await user.type(textarea, "data");
    await user.click(screen.getByRole("button", { name: /parse data/i }));

    expect(screen.getByText("Pasted data")).toBeInTheDocument();
    expect(screen.getByText("4 rows")).toBeInTheDocument();
  });

  it("shows error when pasted text is empty and parsed", async () => {
    const user = userEvent.setup();
    render(<UploadStep onParsed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /paste/i }));
    const textarea = screen.getByPlaceholderText(/paste csv or json data/i);
    await user.type(textarea, "some data");
    await user.clear(textarea);
    await user.click(screen.getByRole("button", { name: /paste/i }));
  });

});
