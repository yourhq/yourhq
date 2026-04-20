import { Users, Search } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

interface ContactsEmptyProps {
  hasFilters: boolean;
  onClearFilters: () => void;
  onAddContact: () => void;
}

export function ContactsEmpty({
  hasFilters,
  onClearFilters,
  onAddContact,
}: ContactsEmptyProps) {
  if (hasFilters) {
    return (
      <EmptyState
        icon={Search}
        title="No contacts match your filters"
        description="Try adjusting or clearing your filters to see more contacts."
        variant="filtered"
        onClearFilters={onClearFilters}
      />
    );
  }

  return (
    <EmptyState
      icon={Users}
      title="No contacts yet"
      description="Add your first contact to start tracking your outreach pipeline."
      action={{
        label: "Add contact",
        onClick: onAddContact,
      }}
    />
  );
}
