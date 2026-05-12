"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useContactOrganizations } from "@/hooks/use-contact-organizations";
import type { Organization } from "@/lib/organizations/types";
import { Building2, Plus, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function ContactOrganizationsSection({ contactId }: { contactId: string }) {
  const { links, loading, addLink, removeLink, searchOrganizations } =
    useContactOrganizations(contactId);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Organization[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const linkedIds = new Set(links.map((l) => l.org_id));

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const data = await searchOrganizations(query);
      setResults(data.filter((o) => !linkedIds.has(o.id)));
      setSearchLoading(false);
    }, 200);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function startSearch() {
    setSearching(true);
    setQuery("");
    setResults([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function cancelSearch() {
    setSearching(false);
    setQuery("");
    setResults([]);
  }

  async function handleAdd(org: Organization) {
    const { error } = await addLink(org.id);
    if (error) {
      toast.error("Failed to link organization");
    } else {
      toast.success(`Linked to ${org.name}`);
    }
    cancelSearch();
  }

  async function handleRemove(linkId: string, orgName: string) {
    await removeLink(linkId);
    toast("Removed organization link", { description: orgName });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Organizations
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={startSearch}
          title="Link organization"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {searching && (
        <div className="mb-2 space-y-1">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelSearch();
              }}
              placeholder="Search organizations..."
              className="w-full h-7 rounded-md border border-input bg-transparent pl-7 pr-7 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={cancelSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {results.length > 0 && (
            <div className="rounded-md border border-border/50 overflow-hidden">
              {results.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => handleAdd(org)}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-xs hover:bg-accent/50 transition-colors"
                >
                  <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{org.name}</span>
                  {org.industry && (
                    <span className="text-muted-foreground truncate ml-auto text-[10px]">
                      {org.industry}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {query.trim() && !searchLoading && results.length === 0 && (
            <p className="text-[10px] text-muted-foreground px-1 py-1">
              No organizations found
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-1.5">
          {[1, 2].map((i) => (
            <div key={i} className="h-9 rounded-md bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 italic">
          No organizations linked
        </p>
      ) : (
        <div className="space-y-1">
          {links.map((link) => (
            <div
              key={link.id}
              className="group flex items-center gap-2 rounded-md border border-border/40 px-2.5 py-1.5 hover:border-border/60 transition-colors"
            >
              <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
              <Link
                href={`/dashboard/organizations/${link.org_id}`}
                className="text-xs font-medium hover:underline truncate min-w-0"
              >
                {link.organization?.name ?? "Unknown"}
              </Link>
              {link.role && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                  {link.role}
                </Badge>
              )}
              {!link.is_current && (
                <span className="text-[10px] text-muted-foreground shrink-0">Former</span>
              )}
              <div className="ml-auto shrink-0">
                <button
                  type="button"
                  onClick={() => handleRemove(link.id, link.organization?.name ?? "")}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5"
                  title="Remove link"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
