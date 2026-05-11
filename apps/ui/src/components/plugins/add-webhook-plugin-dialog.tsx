"use client";

import { useCallback, useEffect, useState } from "react";
import { Webhook } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { createWebhookPlugin } from "@/app/dashboard/settings/plugins/actions";
import { AVAILABLE_HOOKS } from "@/lib/plugins/types";

interface AddWebhookPluginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function AddWebhookPluginDialog({
  open,
  onOpenChange,
  onCreated,
}: AddWebhookPluginDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [selectedHooks, setSelectedHooks] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setWebhookUrl("");
      setWebhookSecret("");
      setSelectedHooks(new Set());
    }
  }, [open]);

  const toggleHook = useCallback((hook: string) => {
    setSelectedHooks((prev) => {
      const next = new Set(prev);
      if (next.has(hook)) next.delete(hook);
      else next.add(hook);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      try {
        const r = await createWebhookPlugin({
          name,
          description: description || undefined,
          webhookUrl,
          webhookSecret: webhookSecret || undefined,
          hooks: Array.from(selectedHooks),
        });
        if (!r.ok) {
          toast.error(r.error ?? "Failed to add plugin");
          return;
        }
        toast.success("Webhook plugin added");
        onOpenChange(false);
        onCreated();
      } finally {
        setSubmitting(false);
      }
    },
    [name, description, webhookUrl, webhookSecret, selectedHooks, onOpenChange, onCreated],
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[520px]">
        <form onSubmit={handleSubmit}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Add webhook plugin</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              HQ will POST matching events to your endpoint with an HMAC
              signature.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="plugin-name" className="text-[12px]">
                Name
              </Label>
              <Input
                id="plugin-name"
                placeholder="Slack Notifications"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plugin-desc" className="text-[12px]">
                Description{" "}
                <span className="font-normal text-muted-foreground/70">
                  (optional)
                </span>
              </Label>
              <Input
                id="plugin-desc"
                placeholder="Post to #ops when tasks complete"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plugin-url" className="text-[12px]">
                Webhook URL
              </Label>
              <Input
                id="plugin-url"
                placeholder="https://hooks.slack.com/services/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="font-mono text-[12px]"
              />
              <p className="text-[11px] text-muted-foreground/70">
                Events are sent as POST requests with a JSON body.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plugin-secret" className="text-[12px]">
                Signing secret{" "}
                <span className="font-normal text-muted-foreground/70">
                  (optional)
                </span>
              </Label>
              <Input
                id="plugin-secret"
                type="password"
                placeholder="whsec_..."
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="font-mono text-[12px]"
              />
              <p className="text-[11px] text-muted-foreground/70">
                Used to sign payloads via HMAC-SHA256. Sent in the{" "}
                <span className="font-mono">X-HQ-Signature</span> header.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12px]">Events to receive</Label>
              <div className="max-h-[200px] overflow-y-auto rounded-md border border-border/60 bg-card">
                {AVAILABLE_HOOKS.map((hook, idx) => (
                  <label
                    key={hook.value}
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/20 ${
                      idx > 0 ? "border-t border-border/30" : ""
                    }`}
                  >
                    <Checkbox
                      checked={selectedHooks.has(hook.value)}
                      onCheckedChange={() => toggleHook(hook.value)}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[12px] font-medium text-foreground">
                        {hook.label}
                      </span>
                      <span className="ml-2 text-[11px] text-muted-foreground/60">
                        {hook.description}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                {selectedHooks.size} event{selectedHooks.size !== 1 ? "s" : ""}{" "}
                selected
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
              <Webhook className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground">
                No code on your gateway — events are sent to your URL
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
              disabled={
                !name.trim() ||
                !webhookUrl.trim() ||
                selectedHooks.size === 0 ||
                submitting
              }
            >
              {submitting ? "Adding..." : "Add plugin"}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
