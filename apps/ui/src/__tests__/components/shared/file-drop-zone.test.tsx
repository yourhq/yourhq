import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FileDropZone } from "@/components/shared/file-drop-zone";

beforeEach(() => {
  vi.clearAllMocks();
});

function createDragEvent(type: string, files: File[] = []) {
  const dt = {
    files,
    types: files.length > 0 ? ["Files"] : [],
    dropEffect: "" as string,
  };
  return { dataTransfer: dt, preventDefault: vi.fn() };
}

describe("FileDropZone", () => {
  it("renders children", () => {
    render(
      <FileDropZone onDrop={vi.fn()}>
        <div>Content here</div>
      </FileDropZone>
    );
    expect(screen.getByText("Content here")).toBeInTheDocument();
  });

  it("does not show overlay by default", () => {
    render(
      <FileDropZone onDrop={vi.fn()}>
        <div>Content</div>
      </FileDropZone>
    );
    expect(screen.queryByText("Drop files to import")).not.toBeInTheDocument();
  });

  it("shows overlay on dragEnter with Files", () => {
    const { container } = render(
      <FileDropZone onDrop={vi.fn()}>
        <div>Content</div>
      </FileDropZone>
    );
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.dragEnter(wrapper, createDragEvent("dragenter", [new File([""], "test.md")]));
    expect(screen.getByText("Drop files to import")).toBeInTheDocument();
  });

  it("renders custom label and description", () => {
    const { container } = render(
      <FileDropZone
        onDrop={vi.fn()}
        label="Upload here"
        description="Drag your files"
      >
        <div>Content</div>
      </FileDropZone>
    );
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.dragEnter(wrapper, createDragEvent("dragenter", [new File([""], "test.md")]));
    expect(screen.getByText("Upload here")).toBeInTheDocument();
    expect(screen.getByText("Drag your files")).toBeInTheDocument();
  });

  it("calls onDrop with files when dropped", () => {
    const onDrop = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <FileDropZone onDrop={onDrop}>
        <div>Content</div>
      </FileDropZone>
    );
    const wrapper = container.firstChild as HTMLElement;
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    fireEvent.drop(wrapper, {
      dataTransfer: {
        files: [file],
        types: ["Files"],
      },
      preventDefault: vi.fn(),
    });
    expect(onDrop).toHaveBeenCalledWith([file]);
  });

  it("does not call onDrop when disabled", () => {
    const onDrop = vi.fn();
    const { container } = render(
      <FileDropZone onDrop={onDrop} disabled>
        <div>Content</div>
      </FileDropZone>
    );
    const wrapper = container.firstChild as HTMLElement;
    const file = new File(["content"], "test.txt");
    fireEvent.drop(wrapper, {
      dataTransfer: { files: [file], types: ["Files"] },
      preventDefault: vi.fn(),
    });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("filters files by accept extensions", () => {
    const onDrop = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <FileDropZone onDrop={onDrop} accept={[".md"]}>
        <div>Content</div>
      </FileDropZone>
    );
    const wrapper = container.firstChild as HTMLElement;
    const mdFile = new File(["# test"], "readme.md");
    const txtFile = new File(["text"], "notes.txt");
    fireEvent.drop(wrapper, {
      dataTransfer: { files: [mdFile, txtFile], types: ["Files"] },
      preventDefault: vi.fn(),
    });
    expect(onDrop).toHaveBeenCalledWith([mdFile]);
  });

  it("does not call onDrop when no files match accept filter", () => {
    const onDrop = vi.fn();
    const { container } = render(
      <FileDropZone onDrop={onDrop} accept={[".pdf"]}>
        <div>Content</div>
      </FileDropZone>
    );
    const wrapper = container.firstChild as HTMLElement;
    const txtFile = new File(["text"], "notes.txt");
    fireEvent.drop(wrapper, {
      dataTransfer: { files: [txtFile], types: ["Files"] },
      preventDefault: vi.fn(),
    });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("does not show overlay when disabled", () => {
    const { container } = render(
      <FileDropZone onDrop={vi.fn()} disabled>
        <div>Content</div>
      </FileDropZone>
    );
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.dragEnter(wrapper, createDragEvent("dragenter", [new File([""], "test.md")]));
    expect(screen.queryByText("Drop files to import")).not.toBeInTheDocument();
  });

  it("hides overlay after dragLeave", () => {
    const { container } = render(
      <FileDropZone onDrop={vi.fn()}>
        <div>Content</div>
      </FileDropZone>
    );
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.dragEnter(wrapper, createDragEvent("dragenter", [new File([""], "test.md")]));
    expect(screen.getByText("Drop files to import")).toBeInTheDocument();
    fireEvent.dragLeave(wrapper, { preventDefault: vi.fn() });
    expect(screen.queryByText("Drop files to import")).not.toBeInTheDocument();
  });

  it("hides overlay after drop", () => {
    const onDrop = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <FileDropZone onDrop={onDrop}>
        <div>Content</div>
      </FileDropZone>
    );
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.dragEnter(wrapper, createDragEvent("dragenter", [new File([""], "test.md")]));
    expect(screen.getByText("Drop files to import")).toBeInTheDocument();
    fireEvent.drop(wrapper, {
      dataTransfer: { files: [new File(["c"], "t.txt")], types: ["Files"] },
      preventDefault: vi.fn(),
    });
    expect(screen.queryByText("Drop files to import")).not.toBeInTheDocument();
  });
});
