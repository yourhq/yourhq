"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { createSecret } from "@/app/dashboard/settings/secrets/actions";
import { deriveKeyFromName } from "@/lib/secrets/utils";

interface AddSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gatewayId: string;
  agentId?: string | null;
  agentName?: string;
  prefilledKey?: string;
  onCreated: () => void;
}

export function AddSecretDialog({
  open,
  onOpenChange,
  gatewayId,
  agentId,
  agentName,
  prefilledKey,
  onCreated,
}: AddSecretDialogProps) {
  const [name, setName] = useState("");
  const [key, setKey] = useState(prefilledKey ?? "");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [scope, setScope] = useState<"gateway" | "agent">("gateway");
  const [showValue, setShowValue] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setKey(prefilledKey ?? "");
      setValue("");
      setNote("");
      setScope(agentId ? "agent" : "gateway");
      setShowValue(false);
    }
  }, [open, agentId, prefilledKey]);

  const handleNameChange = useCallback(
    (val: string) => {
      setName(val);
      if (!prefilledKey) {
        setKey(deriveKeyFromName(val));
      }
    },
    [prefilledKey],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      try {
        const r = await createSecret({
          gatewayId,
          agentId: scope === "agent" ? agentId : null,
          name,
          key,
          value,
          note: note || undefined,
        });
        if (!r.ok) {
          toast.error(r.error ?? "Failed to add secret");
          return;
        }
        toast.success("Secret added");
        onOpenChange(false);
        onCreated();
      } finally {
        setSubmitting(false);
      }
    },
    [gatewayId, agentId, scope, name, key, value, note, onOpenChange, onCreated],
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[460px]">
        <form onSubmit={handleSubmit}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Add a secret</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Encrypted at rest. Only your agent&apos;s tools can read it.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="secret-name" className="text-[12px]">
                What&apos;s this for?
              </Label>
              <Input
                id="secret-name"
                placeholder="Notion API Key"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground/70">
                A short label so you remember what this is.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="secret-key" className="text-[12px]">
                Variable name
              </Label>
              <Input
                id="secret-key"
                placeholder="NOTION_API_KEY"
                className="font-mono text-[12px]"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
              />
              <p className="text-[11px] text-muted-foreground/70">
                Your agent&apos;s tools use this name to read the value.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="secret-value" className="text-[12px]">
                Value
              </Label>
              <InputGroup>
                <InputGroupInput
                  id="secret-value"
                  type={showValue ? "text" : "password"}
                  placeholder="sk-..."
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="font-mono text-[12px]"
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
                Encrypted when saved. You won&apos;t be able to view it again.
              </p>
            </div>

            {agentId && (
              <div className="space-y-1.5">
                <Label className="text-[12px]">Who can use this?</Label>
                <RadioGroup
                  value={scope}
                  onValueChange={(v) => setScope(v as "gateway" | "agent")}
                  className="space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="gateway" id="scope-gateway" />
                    <Label htmlFor="scope-gateway" className="text-[12px] font-normal">
                      All agents on this gateway
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="agent" id="scope-agent" />
                    <Label htmlFor="scope-agent" className="text-[12px] font-normal">
                      Only {agentName ?? "this agent"}
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="secret-note" className="text-[12px]">
                Note{" "}
                <span className="font-normal text-muted-foreground/70">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="secret-note"
                placeholder="For the CRM page sync skill"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="resize-none text-[12px]"
              />
            </div>

            <div className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
              <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground">
                Encrypted &middot; Never shared with the AI model
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
            <Button
              type="submit"
              disabled={!name.trim() || !key || !value || submitting}
            >
              {submitting ? "Adding..." : "Add secret"}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
