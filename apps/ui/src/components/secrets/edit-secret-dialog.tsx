"use client";

import { useCallback, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { updateSecretValue } from "@/app/dashboard/settings/secrets/actions";
import type { Secret } from "@/lib/secrets/types";

interface EditSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret: Secret;
  onUpdated: () => void;
}

export function EditSecretDialog({
  open,
  onOpenChange,
  secret,
  onUpdated,
}: EditSecretDialogProps) {
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!value) return;
      setSubmitting(true);
      try {
        const r = await updateSecretValue(secret.id, value);
        if (!r.ok) {
          toast.error(r.error ?? "Failed to update secret");
          return;
        }
        toast.success("Secret updated");
        onUpdated();
      } finally {
        setSubmitting(false);
      }
    },
    [secret.id, value, onUpdated],
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[460px]">
        <form onSubmit={handleSubmit}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Update secret</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Replace the encrypted value for{" "}
              <span className="font-medium text-foreground">{secret.name}</span>.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2.5">
              <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[13px] font-medium text-foreground">
                  {secret.name}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {secret.key}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-secret-value" className="text-[12px]">
                New value
              </Label>
              <InputGroup>
                <InputGroupInput
                  id="edit-secret-value"
                  type={showValue ? "text" : "password"}
                  placeholder="Enter a new value to replace the current one"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="font-mono text-[12px]"
                  autoFocus
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    onClick={() => setShowValue(!showValue)}
                    aria-label={showValue ? "Hide value" : "Show value"}
                  >
                    {showValue ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <p className="text-[11px] text-muted-foreground/70">
                The previous value will be permanently replaced.
              </p>
            </div>
          </div>

          <ResponsiveDialogFooter className="px-6 pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!value || submitting}>
              {submitting ? "Updating..." : "Update value"}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
