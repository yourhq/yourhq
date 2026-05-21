"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "novel";
import { NovelEditor } from "@/components/knowledge/novel-editor";
import { markdownToTiptap } from "@/lib/knowledge/markdown-to-tiptap";
import { tiptapToMarkdown } from "@/lib/knowledge/tiptap-to-markdown";
import { Button } from "@/components/ui/button";
import { Fingerprint, Heart, Loader2, Bot } from "lucide-react";
import { toast } from "sonner";
import { enqueueAgentCommand } from "@/app/dashboard/agents/actions";
import { EmptyState } from "@/components/shared/empty-state";

interface Props {
  agentId: string;
  slug: string;
  gatewayId: string | null;
}

interface FileState {
  content: string | null;
  sha: string | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  error: boolean;
}

const INITIAL_FILE: FileState = {
  content: null,
  sha: null,
  loading: true,
  saving: false,
  dirty: false,
  error: false,
};

export function AgentPersonalityTab({ agentId, slug, gatewayId }: Props) {
  const [identity, setIdentity] = useState<FileState>(INITIAL_FILE);
  const [soul, setSoul] = useState<FileState>(INITIAL_FILE);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFile = useCallback(
    async (filename: string, setter: (s: FileState) => void) => {
      setter({ ...INITIAL_FILE, loading: true });
      try {
        const res = await fetch(`/api/agents/${slug}/files/${filename}`);
        if (!res.ok) {
          setter({ ...INITIAL_FILE, loading: false, error: true });
          return;
        }
        const data = await res.json();
        setter({
          content: data.content ?? "",
          sha: data.sha ?? null,
          loading: false,
          saving: false,
          dirty: false,
          error: false,
        });
      } catch {
        setter({ ...INITIAL_FILE, loading: false, error: true });
      }
    },
    [slug],
  );

  useEffect(() => {
    if (!gatewayId) return;
    fetchFile("IDENTITY.md", setIdentity);
    fetchFile("SOUL.md", setSoul);
  }, [gatewayId, fetchFile]);

  useEffect(() => {
    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    };
  }, []);

  const scheduleRestart = useCallback(() => {
    if (!gatewayId) return;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(async () => {
      try {
        await enqueueAgentCommand({
          action: "restart_gateway",
          gatewayId,
        });
      } catch {
        toast.warning("Saved, but couldn't restart agent");
      }
    }, 1500);
  }, [gatewayId]);

  if (!gatewayId) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <EmptyState
          icon={Bot}
          title="No gateway assigned"
          description="This agent needs a gateway before personality files can be edited."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-5 py-5">
      <p className="text-[12px] text-muted-foreground/70">
        Define how this agent thinks and communicates. Changes are saved to git
        and applied automatically.
      </p>

      <FileSection
        title="Identity"
        description="Who this agent is — name, role, archetype, and personality."
        icon={Fingerprint}
        slug={slug}
        filename="IDENTITY.md"
        state={identity}
        setState={setIdentity}
        onSaved={scheduleRestart}
        onRetry={() => fetchFile("IDENTITY.md", setIdentity)}
      />

      <FileSection
        title="Soul"
        description="How this agent operates — core truths, thinking style, and boundaries."
        icon={Heart}
        slug={slug}
        filename="SOUL.md"
        state={soul}
        setState={setSoul}
        onSaved={scheduleRestart}
        onRetry={() => fetchFile("SOUL.md", setSoul)}
      />
    </div>
  );
}

function FileSection({
  title,
  description,
  icon: Icon,
  slug,
  filename,
  state,
  setState,
  onSaved,
  onRetry,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  slug: string;
  filename: string;
  state: FileState;
  setState: (s: FileState | ((prev: FileState) => FileState)) => void;
  onSaved: () => void;
  onRetry: () => void;
}) {
  const editorRef = useRef<JSONContent | null>(null);

  const initialContent = useMemo(() => {
    if (state.content == null) return undefined;
    return markdownToTiptap(state.content);
  }, [state.content]);

  useEffect(() => {
    editorRef.current = null;
  }, [state.content, state.sha]);

  const handleChange = useCallback(
    (json: JSONContent) => {
      editorRef.current = json;
      setState((prev: FileState) => (prev.dirty ? prev : { ...prev, dirty: true }));
    },
    [setState],
  );

  const handleSave = useCallback(async () => {
    if (!state.sha || !editorRef.current) return;

    setState((prev: FileState) => ({ ...prev, saving: true }));
    try {
      const markdown = tiptapToMarkdown(editorRef.current);
      const res = await fetch(`/api/agents/${slug}/files/${filename}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: markdown, sha: state.sha }),
      });

      if (!res.ok) {
        if (res.status === 409) {
          toast.error(
            "File was modified elsewhere. Please reload and try again.",
          );
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(
            (err as { error?: string }).error || "Failed to save file",
          );
        }
        setState((prev: FileState) => ({ ...prev, saving: false }));
        return;
      }

      const data = await res.json();
      setState((prev: FileState) => ({
        ...prev,
        sha: data.sha,
        saving: false,
        dirty: false,
      }));
      toast.success("Saved — agent updating");
      onSaved();
    } catch {
      toast.error("Failed to save file");
      setState((prev: FileState) => ({ ...prev, saving: false }));
    }
  }, [slug, filename, state.sha, setState, onSaved]);

  if (state.loading) {
    return (
      <div className="rounded-lg border border-border/50">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 text-muted-foreground/40" />
            <div>
              <h3 className="text-[13px] font-medium text-foreground/60">
                {title}
              </h3>
              <p className="text-[11px] text-muted-foreground/50">
                {description}
              </p>
            </div>
          </div>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
        </div>
        <div className="space-y-3 p-4">
          <div className="h-4 w-3/4 rounded bg-muted/20 animate-pulse" />
          <div className="h-4 w-full rounded bg-muted/20 animate-pulse" />
          <div className="h-4 w-5/6 rounded bg-muted/20 animate-pulse" />
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-lg border border-border/50 px-4 py-6 text-center">
        <Icon className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
        <p className="text-[12px] text-muted-foreground">
          Couldn&apos;t load {filename}. The gateway may be offline.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 h-7 text-xs text-muted-foreground"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-[13px] font-medium text-foreground">
              {title}
            </h3>
            <p className="text-[11px] text-muted-foreground/70">
              {description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state.dirty && !state.saving && (
            <span
              className="h-2 w-2 rounded-full bg-accent-orange"
              title="Unsaved changes"
            />
          )}
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={!state.dirty || state.saving}
            onClick={handleSave}
          >
            {state.saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving…
              </>
            ) : (
              "Save & Update"
            )}
          </Button>
        </div>
      </div>
      <div className="px-4 py-4">
        <NovelEditor
          key={`${filename}-${state.sha}`}
          initialContent={initialContent}
          onChange={handleChange}
          className="min-h-[200px]"
        />
      </div>
    </div>
  );
}
