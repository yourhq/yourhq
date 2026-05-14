import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmbeddingStatus } from "@/components/knowledge/embedding-status";

describe("EmbeddingStatus", () => {
  it("shows 'Search ready' when both statuses are indexed", () => {
    render(
      <EmbeddingStatus embeddingStatus="indexed" chunkStatus="indexed" />
    );
    expect(screen.getByText("Search ready")).toBeInTheDocument();
  });

  it("shows 'Text ready' when only chunkStatus is indexed", () => {
    render(
      <EmbeddingStatus embeddingStatus="pending" chunkStatus="indexed" />
    );
    expect(screen.getByText("Text ready")).toBeInTheDocument();
  });

  it("shows 'Index failed' when embeddingStatus is failed", () => {
    render(
      <EmbeddingStatus embeddingStatus="failed" chunkStatus="pending" />
    );
    expect(screen.getByText("Index failed")).toBeInTheDocument();
  });

  it("shows 'Index failed' when chunkStatus is failed", () => {
    render(
      <EmbeddingStatus embeddingStatus="pending" chunkStatus="failed" />
    );
    expect(screen.getByText("Index failed")).toBeInTheDocument();
  });

  it("shows 'Indexing...' when both are pending", () => {
    render(
      <EmbeddingStatus embeddingStatus="pending" chunkStatus="pending" />
    );
    expect(screen.getByText("Indexing...")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <EmbeddingStatus
        embeddingStatus="indexed"
        chunkStatus="indexed"
        className="custom"
      />
    );
    expect(container.firstChild).toHaveClass("custom");
  });
});
