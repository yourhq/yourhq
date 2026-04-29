"use client";

// AddConnectionDialog — pick a provider, then complete its auth flow.
//
// Visual anatomy mirrors AddGatewayDialog: padded body, bordered
// header/footer, inline destructive alert for errors. Phase shape
// changes per provider auth shape, not per provider — same dialog
// renders the api-key form for OpenRouter and Mistral, the oauth-paste
// flow for Codex and Gemini CLI, etc.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Plug,
  Search,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PROVIDER_CATALOG,
  type ProviderCatalogEntry,
  type ConnectionCommandState,
} from "@/lib/connections/types";
import {
  enqueueConnectionCommand,
  waitForCommand,
  getCommandAction,
} from "@/app/dashboard/settings/connections/actions";
import { useRealtime } from "@/hooks/use-realtime";

interface AddConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gatewayId: string;
  gatewayLabel: string;
  onAdded?: () => void;
}

type Phase =
  | { kind: "pick" }
  | { kind: "configure"; provider: ProviderCatalogEntry }
  | {
      kind: "interactive";
      provider: ProviderCatalogEntry;
      mode: "oauth_paste" | "device_code";
      commandId: string;
    }
  | { kind: "done"; provider: ProviderCatalogEntry };

export function AddConnectionDialog({
  open,
  onOpenChange,
  gatewayId,
  gatewayLabel,
  onAdded,
}: AddConnectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        {open && (
          <AddConnectionDialogInner
            onClose={() => onOpenChange(false)}
            gatewayId={gatewayId}
            gatewayLabel={gatewayLabel}
            onAdded={onAdded}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddConnectionDialogInner({
  onClose,
  gatewayId,
  gatewayLabel,
  onAdded,
}: {
  onClose: () => void;
  gatewayId: string;
  gatewayLabel: string;
  onAdded?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
        <DialogTitle className="text-heading flex items-center gap-2">
          {phase.kind !== "pick" && phase.kind !== "done" && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setPhase({ kind: "pick" });
              }}
              className="-ml-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <span>
            {phase.kind === "pick" && "Add a connection"}
            {phase.kind === "configure" && phase.provider.displayName}
            {phase.kind === "interactive" && phase.provider.displayName}
            {phase.kind === "done" && phase.provider.displayName}
          </span>
        </DialogTitle>
        <DialogDescription className="text-caption text-muted-foreground">
          Adds the credential to <span className="font-medium text-foreground">{gatewayLabel}</span>. Agents on this gateway will be able to use it.
        </DialogDescription>
      </DialogHeader>

      {phase.kind === "pick" && (
        <PickPhase
          onPick={(provider) => {
            setError(null);
            setPhase({ kind: "configure", provider });
          }}
        />
      )}

      {phase.kind === "configure" && (
        <ConfigurePhase
          provider={phase.provider}
          gatewayId={gatewayId}
          error={error}
          onError={setError}
          onCancel={onClose}
          onApiKeySuccess={() => {
            onAdded?.();
            setPhase({ kind: "done", provider: phase.provider });
          }}
          onInteractiveStart={(mode, commandId) => {
            setPhase({
              kind: "interactive",
              provider: phase.provider,
              mode,
              commandId,
            });
          }}
        />
      )}

      {phase.kind === "interactive" && (
        <InteractivePhase
          mode={phase.mode}
          commandId={phase.commandId}
          gatewayId={gatewayId}
          onSuccess={() => {
            onAdded?.();
            setPhase({ kind: "done", provider: phase.provider });
          }}
          onFailure={(msg) => {
            setError(msg);
            setPhase({ kind: "configure", provider: phase.provider });
          }}
          onCancel={onClose}
        />
      )}

      {phase.kind === "done" && <DonePhase onClose={onClose} provider={phase.provider} />}
    </>
  );
}

// ─── Step 1: pick a provider ─────────────────────────────────────────

function PickPhase({ onPick }: { onPick: (p: ProviderCatalogEntry) => void }) {
  const [search, setSearch] = useState("");
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (p: ProviderCatalogEntry) =>
      !q || p.displayName.toLowerCase().includes(q) || p.id.includes(q);
    return {
      recommended: PROVIDER_CATALOG.filter((p) => p.category === "recommended" && match(p)),
      open_models: PROVIDER_CATALOG.filter((p) => p.category === "open_models" && match(p)),
      all: PROVIDER_CATALOG.filter((p) => p.category === "all" && match(p)),
    };
  }, [search]);

  return (
    <div className="flex flex-col">
      <div className="border-b border-border/50 px-5 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search providers"
            className="h-8 pl-8 text-[12px]"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-[420px] overflow-auto px-5 py-3">
        {groups.recommended.length > 0 && (
          <ProviderGroup
            title="Recommended"
            description="The most common picks. Each agent can use a different one."
            providers={groups.recommended}
            onPick={onPick}
          />
        )}
        {groups.open_models.length > 0 && (
          <ProviderGroup
            title="Run your own"
            description="Local model servers — no API key, no cost per call."
            providers={groups.open_models}
            onPick={onPick}
          />
        )}
        {groups.all.length > 0 && (
          <ProviderGroup
            title="Everything else"
            description="Other providers openclaw supports."
            providers={groups.all}
            onPick={onPick}
          />
        )}
        {groups.recommended.length === 0 &&
          groups.open_models.length === 0 &&
          groups.all.length === 0 && (
            <div className="py-10 text-center text-[12px] text-muted-foreground">
              No providers matching “{search}”.
            </div>
          )}
      </div>
    </div>
  );
}

function ProviderGroup({
  title,
  description,
  providers,
  onPick,
}: {
  title: string;
  description: string;
  providers: ProviderCatalogEntry[];
  onPick: (p: ProviderCatalogEntry) => void;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        <span className="text-[11px] text-muted-foreground/60">{description}</span>
      </div>
      <div className="space-y-1">
        {providers.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => onPick(p)}
            className="group flex w-full items-center gap-3 rounded-md border border-border/60 bg-card px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-accent/40"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted/40 text-muted-foreground">
              <Plug className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[12.5px] font-medium text-foreground">
                  {p.displayName}
                </span>
                <AuthShapeTag shape={p.authShape} />
              </div>
              {p.blurb && (
                <p className="truncate text-[11px] text-muted-foreground/70">
                  {p.blurb}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function AuthShapeTag({ shape }: { shape: ProviderCatalogEntry["authShape"] }) {
  const labels: Record<ProviderCatalogEntry["authShape"], string> = {
    api_key: "API key",
    oauth_paste: "Sign in",
    device_code: "Sign in",
    cli_reuse: "Reuses CLI login",
    local_url: "Local",
  };
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
      {labels[shape]}
    </span>
  );
}

// ─── Step 2 (api_key): simple paste-token form ───────────────────────

function ConfigurePhase({
  provider,
  gatewayId,
  error,
  onError,
  onCancel,
  onApiKeySuccess,
  onInteractiveStart,
}: {
  provider: ProviderCatalogEntry;
  gatewayId: string;
  error: string | null;
  onError: (msg: string | null) => void;
  onCancel: () => void;
  onApiKeySuccess: () => void;
  onInteractiveStart: (
    mode: "oauth_paste" | "device_code",
    commandId: string,
  ) => void;
}) {
  // For Codex (alternateShape: device_code), let the user pick.
  const [mode, setMode] = useState<"oauth_paste" | "device_code">(
    provider.alternateShape === "device_code"
      ? "oauth_paste"
      : (provider.authShape === "device_code"
          ? "device_code"
          : "oauth_paste"),
  );

  if (provider.authShape === "api_key") {
    return (
      <ApiKeyForm
        provider={provider}
        gatewayId={gatewayId}
        error={error}
        onError={onError}
        onCancel={onCancel}
        onSuccess={onApiKeySuccess}
      />
    );
  }
  if (provider.authShape === "local_url") {
    return (
      <LocalUrlForm
        provider={provider}
        gatewayId={gatewayId}
        error={error}
        onError={onError}
        onCancel={onCancel}
        onSuccess={onApiKeySuccess}
      />
    );
  }

  // oauth_paste / device_code — kick off auth_start, transition to InteractivePhase.
  return (
    <SignInLauncher
      provider={provider}
      gatewayId={gatewayId}
      mode={mode}
      setMode={setMode}
      error={error}
      onError={onError}
      onCancel={onCancel}
      onStarted={(cmdId) => onInteractiveStart(mode, cmdId)}
    />
  );
}

function ApiKeyForm({
  provider,
  gatewayId,
  error,
  onError,
  onCancel,
  onSuccess,
}: {
  provider: ProviderCatalogEntry;
  gatewayId: string;
  error: string | null;
  onError: (msg: string | null) => void;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const apiKey = String(fd.get("apiKey") ?? "").trim();
        if (!apiKey) {
          onError("API key is required.");
          return;
        }
        setSubmitting(true);
        onError(null);
        try {
          const enq = await enqueueConnectionCommand({
            gatewayId,
            action: "auth_set_api_key",
            payload: {
              provider: provider.id,
              api_key: apiKey,
              profile_name: "default",
            },
          });
          if (!enq.ok || !enq.data) {
            onError(enq.error ?? "Failed to enqueue command");
            return;
          }
          const w = await waitForCommand(enq.data.commandId, 30_000);
          if (!w.ok || !w.data) {
            onError(w.error ?? "Command did not complete");
            return;
          }
          if (w.data.status === "failed") {
            onError(w.data.error_message ?? "Failed to save credential");
            return;
          }
          onSuccess();
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="px-5 py-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="apiKey" className="text-[12px]">
            API key
          </Label>
          <div className="relative">
            <Input
              id="apiKey"
              name="apiKey"
              type={revealed ? "text" : "password"}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-…"
              className="pr-9 font-mono text-[12px]"
            />
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={revealed ? "Hide key" : "Show key"}
              tabIndex={-1}
            >
              {revealed ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          {provider.helpUrl && (
            <p className="text-[11px] text-muted-foreground/70">
              <a
                href={provider.helpUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
              >
                Get an API key from {provider.displayName}
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          )}
        </div>

        {provider.envVar && (
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            We store this securely in the gateway&apos;s auth store. You can
            also set the <code className="font-mono text-foreground/80">{provider.envVar}</code> environment variable instead — but pasting it here is the simpler path.
          </div>
        )}

        {error && <ErrorBanner message={error} />}
      </div>

      <DialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Saving…
            </>
          ) : (
            "Connect"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function LocalUrlForm({
  provider,
  gatewayId,
  error,
  onError,
  onCancel,
  onSuccess,
}: {
  provider: ProviderCatalogEntry;
  gatewayId: string;
  error: string | null;
  onError: (msg: string | null) => void;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const defaultUrl = useMemo(() => {
    if (provider.id === "ollama") return "http://127.0.0.1:11434";
    if (provider.id === "lmstudio") return "http://127.0.0.1:1234";
    if (provider.id === "vllm") return "http://127.0.0.1:8000/v1";
    if (provider.id === "sglang") return "http://127.0.0.1:30000/v1";
    return "";
  }, [provider.id]);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const baseUrl = String(fd.get("baseUrl") ?? "").trim();
        const token = String(fd.get("token") ?? "").trim();
        if (!baseUrl) {
          onError("Base URL is required.");
          return;
        }
        setSubmitting(true);
        onError(null);
        try {
          // For local providers, the auth shape openclaw expects is the
          // same paste-token shape — we just set the key to a local
          // sentinel ("ollama-local") if no token, or whatever the user
          // pasted. The base URL is configured separately by openclaw
          // models config; we do best-effort by setting a token only.
          // openclaw's behavior: providers without env vars set are
          // auto-discovered from defaults, so for the common case
          // (Ollama on 127.0.0.1:11434) the user only needs to confirm.
          const enq = await enqueueConnectionCommand({
            gatewayId,
            action: "auth_set_api_key",
            payload: {
              provider: provider.id,
              api_key: token || "ollama-local",
              profile_name: "default",
              base_url: baseUrl,
            },
          });
          if (!enq.ok || !enq.data) {
            onError(enq.error ?? "Failed to enqueue command");
            return;
          }
          const w = await waitForCommand(enq.data.commandId, 30_000);
          if (!w.ok || !w.data) {
            onError(w.error ?? "Command did not complete");
            return;
          }
          if (w.data.status === "failed") {
            onError(w.data.error_message ?? "Failed to save");
            return;
          }
          onSuccess();
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="px-5 py-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="baseUrl" className="text-[12px]">
            Base URL
          </Label>
          <Input
            id="baseUrl"
            name="baseUrl"
            autoFocus
            placeholder={defaultUrl}
            defaultValue={defaultUrl}
            className="font-mono text-[12px]"
          />
          <p className="text-[11px] text-muted-foreground/70">
            Where {provider.displayName} is running. Use{" "}
            <code className="font-mono">127.0.0.1</code> for the same machine
            as the gateway.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="token" className="text-[12px]">
            Token{" "}
            <span className="ml-1 font-normal text-muted-foreground/70">
              (optional)
            </span>
          </Label>
          <Input
            id="token"
            name="token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Leave blank for local hosts"
            className="font-mono text-[12px]"
          />
          <p className="text-[11px] text-muted-foreground/70">
            Only needed for cloud-hosted instances or {provider.displayName}{" "}
            servers behind auth.
          </p>
        </div>

        {error && <ErrorBanner message={error} />}
      </div>

      <DialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Saving…
            </>
          ) : (
            "Connect"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Step 2 (sign in): kick off auth_start ──────────────────────────

function SignInLauncher({
  provider,
  gatewayId,
  mode,
  setMode,
  error,
  onError,
  onCancel,
  onStarted,
}: {
  provider: ProviderCatalogEntry;
  gatewayId: string;
  mode: "oauth_paste" | "device_code";
  setMode: (m: "oauth_paste" | "device_code") => void;
  error: string | null;
  onError: (msg: string | null) => void;
  onCancel: () => void;
  onStarted: (commandId: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const supportsToggle = !!provider.alternateShape;

  return (
    <div>
      <div className="px-5 py-4 space-y-4">
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 text-[12px] leading-relaxed">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-foreground">
                Sign in with your {provider.displayName} account — no API key
                to manage.
              </p>
              <p className="text-muted-foreground">
                {mode === "device_code"
                  ? "We'll show you a short code. Open the URL we give you, paste the code in, approve. Done."
                  : "We'll show you a URL. Open it, sign in. If your browser is on the same machine as the gateway, sign-in completes automatically — otherwise paste the page you land on back here."}
              </p>
            </div>
          </div>
        </div>

        {supportsToggle && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground/70">Trouble with the browser?</span>
            <button
              type="button"
              onClick={() =>
                setMode(mode === "device_code" ? "oauth_paste" : "device_code")
              }
              className="underline underline-offset-2 text-foreground hover:text-primary"
            >
              {mode === "device_code"
                ? "Use the paste-URL flow instead"
                : "Use a short code instead"}
            </button>
          </div>
        )}

        {error && <ErrorBanner message={error} />}
      </div>

      <DialogFooter className="px-5 py-3 border-t border-border/50 gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            onError(null);
            try {
              const enq = await enqueueConnectionCommand({
                gatewayId,
                action: "auth_start",
                payload: {
                  provider: provider.id,
                  profile_name: "default",
                  mode,
                },
              });
              if (!enq.ok || !enq.data) {
                onError(enq.error ?? "Failed to start sign-in");
                return;
              }
              onStarted(enq.data.commandId);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Starting…
            </>
          ) : (
            <>Sign in with {provider.displayName}</>
          )}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Step 3: interactive flow (URL/code shown, user paste-back) ─────

function InteractivePhase({
  mode,
  commandId,
  gatewayId,
  onSuccess,
  onFailure,
  onCancel,
}: {
  mode: "oauth_paste" | "device_code";
  commandId: string;
  gatewayId: string;
  onSuccess: () => void;
  onFailure: (msg: string) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<ConnectionCommandState>({
    stage: "starting",
  });
  const [pasted, setPasted] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState<"url" | "code" | null>(null);

  // Keep callback refs so the realtime effect stays mounted on the same key.
  const onSuccessRef = useRef(onSuccess);
  const onFailureRef = useRef(onFailure);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onFailureRef.current = onFailure;
  });

  // Polling fallback for state changes (realtime may lag for payload-only updates).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const r = await getCommandAction(commandId);
      if (cancelled) return;
      if (!r.ok || !r.data) return;
      const cmd = r.data;
      const cs = (cmd.payload?.connection_state ??
        null) as ConnectionCommandState | null;
      if (cs) setState(cs);
      if (cmd.status === "done") {
        onSuccessRef.current();
      } else if (cmd.status === "failed") {
        onFailureRef.current(cmd.error_message ?? "Sign-in failed.");
      }
    };
    const interval = setInterval(tick, 1500);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [commandId]);

  // Realtime takes the same path; we just refetch to get the merged payload.
  useRealtime({
    table: "agent_commands",
    filter: `gateway_id=eq.${gatewayId}`,
    onPayload: () => {
      void getCommandAction(commandId).then((r) => {
        if (!r.ok || !r.data) return;
        const cs = (r.data.payload?.connection_state ??
          null) as ConnectionCommandState | null;
        if (cs) setState(cs);
        if (r.data.status === "done") onSuccessRef.current();
        else if (r.data.status === "failed")
          onFailureRef.current(r.data.error_message ?? "Sign-in failed.");
      });
    },
  });

  async function copy(value: string, key: "url" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {}
  }

  return (
    <div>
      <div className="px-5 py-4 space-y-3">
        {state.stage === "starting" && (
          <div className="flex items-center gap-2 py-6 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Asking openclaw to start the sign-in flow…
          </div>
        )}

        {(state.stage === "url_ready" || state.stage === "polling") && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[12px]">
                {mode === "device_code" ? "Step 1 — open this URL" : "Step 1 — open this URL"}
              </Label>
              <div className="flex gap-1.5">
                <Input
                  value={state.url}
                  readOnly
                  className="font-mono text-[11px]"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(state.url, "url")}
                  className="shrink-0 h-9 px-2.5"
                  title="Copy"
                >
                  {copied === "url" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  asChild
                  className="shrink-0 h-9"
                >
                  <a href={state.url} target="_blank" rel="noreferrer">
                    Open
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              </div>
            </div>

            {state.verificationCode && (
              <div className="space-y-1.5">
                <Label className="text-[12px]">Step 2 — enter this code on that page</Label>
                <div className="flex items-center gap-2">
                  <code className="rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-[18px] tracking-[0.3em] text-foreground">
                    {state.verificationCode}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(state.verificationCode!, "code")}
                    className="h-9"
                  >
                    {copied === "code" ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mr-1.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy code
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {mode === "device_code" ? (
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for you to approve in your browser…
              </div>
            ) : state.stage === "url_ready" && state.autoCallback ? (
              // oauth_paste in local mode: openclaw's own listener catches
              // the redirect on the gateway machine. The user just signs
              // in and the flow auto-completes — no paste step.
              <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for you to finish signing in…
                </div>
                <p className="text-[10.5px] text-muted-foreground/70">
                  When you complete sign-in in your browser, this dialog
                  will close automatically.
                </p>
              </div>
            ) : (
              // oauth_paste in remote mode: user's browser is on a
              // different machine, openclaw's localhost:1455 listener
              // can't catch their redirect, so they paste the URL back.
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="redirect" className="text-[12px]">
                  Step 2 — paste the page you landed on
                </Label>
                <div className="flex gap-1.5">
                  <Input
                    id="redirect"
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder="https://… or the code from the page"
                    className="font-mono text-[11px]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!pasted.trim() || submitting}
                    onClick={async () => {
                      const value = pasted.trim();
                      if (!value) return;
                      setSubmitting(true);
                      try {
                        const enq = await enqueueConnectionCommand({
                          gatewayId,
                          action: "auth_paste",
                          payload: {
                            parent_command_id: commandId,
                            value,
                          },
                        });
                        if (!enq.ok || !enq.data) {
                          onFailure(enq.error ?? "Failed to submit code");
                          return;
                        }
                        // The parent command (auth_start) will transition
                        // to done/failed; the realtime/polling above
                        // catches that and closes the dialog. We don't
                        // gate on the auth_paste row itself.
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className="shrink-0 h-9"
                  >
                    {submitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Submit"
                    )}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                  After signing in, copy the address bar (or any code shown on
                  the page) and paste it here.
                </p>
              </div>
            )}
          </>
        )}

        {state.stage === "completed" && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-[12px] text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Signed in. Saving credential…
          </div>
        )}

        {state.stage === "failed" && (
          <ErrorBanner message={state.error || "Sign-in failed."} />
        )}
      </div>

      <DialogFooter className="px-5 py-3 border-t border-border/50">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Step 4: done ───────────────────────────────────────────────────

function DonePhase({
  onClose,
  provider,
}: {
  onClose: () => void;
  provider: ProviderCatalogEntry;
}) {
  return (
    <>
      <div className="px-5 py-4">
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2.5 text-[12px]">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <div className="min-w-0 space-y-0.5">
            <div className="font-medium text-foreground">
              {provider.displayName} connected
            </div>
            <p className="text-muted-foreground">
              Agents on this gateway can now use it. You can set it as the
              default in Settings → Connections.
            </p>
          </div>
        </div>
      </div>
      <DialogFooter className="px-5 py-3 border-t border-border/50">
        <Button type="button" size="sm" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

// ─── shared ──────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px]">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
      <span className="min-w-0 text-destructive">{message}</span>
    </div>
  );
}

