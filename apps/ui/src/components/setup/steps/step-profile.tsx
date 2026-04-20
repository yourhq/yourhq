"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, Check } from "lucide-react";
import { toast } from "sonner";
import type { WizardState } from "../setup-wizard";

const ALL_TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [
      "America/New_York", "America/Chicago", "America/Denver",
      "America/Los_Angeles", "Europe/London", "Europe/Paris",
      "Asia/Tokyo", "Asia/Kolkata", "Australia/Sydney", "Pacific/Auckland",
    ];
  }
})();

interface Props {
  ownerName: string;
  preferredName: string;
  timezone: string;
  onChange: (updates: Partial<WizardState>) => void;
}

export function StepProfile({ ownerName, preferredName, timezone, onChange }: Props) {
  const [tzQuery, setTzQuery] = useState(timezone);
  const [showDropdown, setShowDropdown] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = tzQuery.trim().toLowerCase();
    if (!q) return ALL_TIMEZONES.slice(0, 20);
    return ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(q)).slice(0, 20);
  }, [tzQuery]);

  function autoDetect() {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      onChange({ timezone: detected });
      setTzQuery(detected);
    } catch {
      toast.error("Could not detect timezone");
    }
  }

  useEffect(() => {
    if (!timezone) {
      try {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        onChange({ timezone: detected });
        setTzQuery(detected);
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[15px] font-semibold text-foreground">
          Your profile
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Shared with agents via USER.md when they&apos;re created.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-muted-foreground">
            Name
          </label>
          <input
            ref={nameRef}
            type="text"
            value={ownerName}
            onChange={(e) => onChange({ ownerName: e.target.value })}
            placeholder="Your full name"
            className="w-full h-9 rounded-md border border-border/60 bg-transparent px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-muted-foreground">
            Preferred name
          </label>
          <input
            type="text"
            value={preferredName}
            onChange={(e) => onChange({ preferredName: e.target.value })}
            placeholder="What agents should call you"
            className="w-full h-9 rounded-md border border-border/60 bg-transparent px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-muted-foreground">
            Timezone
          </label>
          <div className="relative">
            <input
              type="text"
              value={tzQuery}
              onChange={(e) => {
                setTzQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="America/New_York"
              className="w-full h-9 rounded-md border border-border/60 bg-transparent px-3 pr-20 text-sm font-mono outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
            />
            <button
              type="button"
              onClick={autoDetect}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/40 transition-colors"
              title="Auto-detect timezone"
            >
              <Globe className="h-3 w-3" />
              Detect
            </button>
            {showDropdown && filtered.length > 0 && (
              <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border/60 bg-popover p-1 shadow-md">
                {filtered.map((tz) => (
                  <button
                    key={tz}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange({ timezone: tz });
                      setTzQuery(tz);
                      setShowDropdown(false);
                    }}
                    className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-sm font-mono hover:bg-accent text-left"
                  >
                    <span>{tz}</span>
                    {tz === timezone && <Check className="h-3 w-3 text-muted-foreground" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
