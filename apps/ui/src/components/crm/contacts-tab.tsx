"use client";

import { useState, useCallback } from "react";
import { useContacts } from "@/hooks/use-contacts";
import { useRouter } from "next/navigation";
import { Contact } from "@/lib/crm/types";
import { ContactsFilterBar } from "./contacts-filter-bar";
import { ContactsTableView } from "./contacts-table-view";
import { ContactsCardView } from "./contacts-card-view";
import { ContactsKanbanView } from "./contacts-kanban-view";
import { ContactForm } from "./contact-form";
import { ImportWizard } from "@/components/import/import-wizard";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import type { ColumnToggleItem } from "@/lib/columns/types";

interface ColumnToggleState {
  toggleItems: ColumnToggleItem[];
  onToggleColumn: (id: string) => void;
  onResetColumns: () => void;
}

export function ContactsTab() {
  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [columnToggle, setColumnToggle] = useState<ColumnToggleState | null>(null);
  const {
    contacts,
    allContacts,
    campaigns,
    loading,
    viewMode,
    changeViewMode,
    sorting,
    setSorting,
    filters,
    actions,
    form,
  } = useContacts();

  function handleSelectContact(contact: Contact) {
    router.push(`/dashboard/contacts/${contact.id}`);
  }

  const handleColumnToggleChange = useCallback((state: ColumnToggleState) => {
    setColumnToggle(state);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border/60 px-5 py-3">
        <ContactsFilterBar
          contactCount={contacts.length}
          totalCount={allContacts.length}
          globalFilter={filters.globalFilter}
          onGlobalFilterChange={filters.setGlobalFilter}
          statusFilter={filters.statusFilter}
          onStatusFilterChange={filters.setStatusFilter}
          priorityFilter={filters.priorityFilter}
          onPriorityFilterChange={filters.setPriorityFilter}
          followUpFilter={filters.followUpFilter}
          onFollowUpFilterChange={filters.setFollowUpFilter}
          showArchived={filters.showArchived}
          onShowArchivedChange={filters.setShowArchived}
          viewMode={viewMode}
          onViewModeChange={changeViewMode}
          onRefresh={actions.fetchContacts}
          onAddContact={form.openCreateForm}
          onImport={() => setShowImportWizard(true)}
          onClearFilters={filters.clearFilters}
          columnToggle={viewMode === "table" ? columnToggle : null}
        />
      </div>

      <div className="flex-1 overflow-auto p-5">

      {viewMode === "table" && (
        <ContactsTableView
          contacts={contacts}
          loading={loading}
          hasFilters={filters.hasActiveFilters}
          sorting={sorting}
          onSortingChange={setSorting}
          onSelect={handleSelectContact}
          onStatusChange={actions.handleStatusChange}
          onArchive={actions.handleArchiveContact}
          onRestore={actions.handleRestoreContact}
          onDelete={setDeleteId}
          showArchived={filters.showArchived}
          onClearFilters={filters.clearFilters}
          onAddContact={form.openCreateForm}
          onColumnToggleChange={handleColumnToggleChange}
        />
      )}

      {viewMode === "cards" && (
        <ContactsCardView
          contacts={contacts}
          loading={loading}
          hasFilters={filters.hasActiveFilters}
          onSelect={handleSelectContact}
          onEdit={form.openEditForm}
          onStatusChange={actions.handleStatusChange}
          onArchive={actions.handleArchiveContact}
          onRestore={actions.handleRestoreContact}
          onDelete={setDeleteId}
          showArchived={filters.showArchived}
          onClearFilters={filters.clearFilters}
          onAddContact={form.openCreateForm}
        />
      )}

      {viewMode === "kanban" && (
        <ContactsKanbanView
          contacts={contacts}
          loading={loading}
          hasFilters={filters.hasActiveFilters}
          onSelect={handleSelectContact}
          onStatusChange={actions.handleStatusChange}
          onArchive={actions.handleArchiveContact}
          onClearFilters={filters.clearFilters}
          onAddContact={form.openCreateForm}
        />
      )}

      </div>

      <ContactForm
        open={form.showForm}
        onClose={form.closeForm}
        contact={form.editingContact}
        campaigns={campaigns}
        onSaved={form.onFormSaved}
      />

      <ImportWizard
        entityType="contact"
        open={showImportWizard}
        onClose={() => setShowImportWizard(false)}
        onComplete={actions.fetchContacts}
      />

      <ConfirmDeleteDialog
        open={!!deleteId}
        onConfirm={() => {
          if (deleteId) actions.handleDeleteContact(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
        title="Delete contact permanently?"
        description="This action cannot be undone. This contact and all associated outreach history will be permanently removed."
      />
    </div>
  );
}
