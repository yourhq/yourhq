import { describe, test, expect } from "vitest";
import { filenameToTitle } from "@/lib/knowledge/import-utils";

describe("filenameToTitle", () => {
  test("strips .md extension and title-cases", () => {
    expect(filenameToTitle("my-document.md")).toBe("My Document");
  });

  test("strips .markdown extension", () => {
    expect(filenameToTitle("readme.markdown")).toBe("Readme");
  });

  test("strips .txt extension", () => {
    expect(filenameToTitle("notes.txt")).toBe("Notes");
  });

  test("case-insensitive extension stripping", () => {
    expect(filenameToTitle("guide.MD")).toBe("Guide");
  });

  test("replaces underscores with spaces", () => {
    expect(filenameToTitle("my_cool_doc.md")).toBe("My Cool Doc");
  });

  test("replaces hyphens with spaces", () => {
    expect(filenameToTitle("getting-started.md")).toBe("Getting Started");
  });

  test("handles multiple consecutive separators", () => {
    expect(filenameToTitle("a--b__c.md")).toBe("A B C");
  });

  test("returns Untitled for empty result", () => {
    expect(filenameToTitle(".md")).toBe("Untitled");
  });

  test("handles filenames without recognized extension", () => {
    expect(filenameToTitle("report.pdf")).toBe("Report.Pdf");
  });

  test("title-cases each word", () => {
    expect(filenameToTitle("hello-world-guide.txt")).toBe(
      "Hello World Guide"
    );
  });
});
