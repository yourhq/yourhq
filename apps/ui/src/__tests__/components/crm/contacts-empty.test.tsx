import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactsEmpty } from "@/components/crm/contacts-empty";

describe("ContactsEmpty", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders default empty state when no filters active", () => {
    render(
      <ContactsEmpty
        hasFilters={false}
        onClearFilters={vi.fn()}
        onAddContact={vi.fn()}
      />
    );
    expect(screen.getByText("No contacts yet")).toBeInTheDocument();
    expect(
      screen.getByText("Add your first contact to start tracking your outreach pipeline.")
    ).toBeInTheDocument();
  });

  it("shows Add contact button in default state", () => {
    render(
      <ContactsEmpty
        hasFilters={false}
        onClearFilters={vi.fn()}
        onAddContact={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /Add contact/i })).toBeInTheDocument();
  });

  it("calls onAddContact when Add contact is clicked", async () => {
    const user = userEvent.setup();
    const onAddContact = vi.fn();
    render(
      <ContactsEmpty
        hasFilters={false}
        onClearFilters={vi.fn()}
        onAddContact={onAddContact}
      />
    );
    await user.click(screen.getByRole("button", { name: /Add contact/i }));
    expect(onAddContact).toHaveBeenCalledTimes(1);
  });

  it("renders filtered empty state when filters are active", () => {
    render(
      <ContactsEmpty
        hasFilters={true}
        onClearFilters={vi.fn()}
        onAddContact={vi.fn()}
      />
    );
    expect(screen.getByText("No contacts match your filters")).toBeInTheDocument();
    expect(
      screen.getByText("Try adjusting or clearing your filters to see more contacts.")
    ).toBeInTheDocument();
  });

  it("shows Clear filters button in filtered state", () => {
    render(
      <ContactsEmpty
        hasFilters={true}
        onClearFilters={vi.fn()}
        onAddContact={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /Clear filters/i })).toBeInTheDocument();
  });

  it("calls onClearFilters when Clear filters is clicked", async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    render(
      <ContactsEmpty
        hasFilters={true}
        onClearFilters={onClearFilters}
        onAddContact={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: /Clear filters/i }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("does not show Add contact button in filtered state", () => {
    render(
      <ContactsEmpty
        hasFilters={true}
        onClearFilters={vi.fn()}
        onAddContact={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /Add contact/i })).not.toBeInTheDocument();
  });

  it("does not show Clear filters button in default state", () => {
    render(
      <ContactsEmpty
        hasFilters={false}
        onClearFilters={vi.fn()}
        onAddContact={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /Clear filters/i })).not.toBeInTheDocument();
  });
});
