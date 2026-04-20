"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Comment } from "@/lib/tasks/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";

/** Extract @mentions from comment body */
function parseMentions(body: string): string[] {
  const matches = body.match(/@[\w-]+/g);
  return matches ? [...new Set(matches)] : [];
}

export function useComments(taskId: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("comments")
      .select("*, actor_agent:agents!comments_actor_agent_id_fkey(id, name, slug, avatar_url)")
      .eq("entity_type", "task")
      .eq("entity_id", taskId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      // Build threaded structure
      const topLevel: Comment[] = [];
      const byParent = new Map<string, Comment[]>();

      for (const c of data as unknown as Comment[]) {
        if (c.parent_id) {
          const existing = byParent.get(c.parent_id) || [];
          existing.push(c);
          byParent.set(c.parent_id, existing);
        } else {
          topLevel.push(c);
        }
      }

      // Attach replies
      for (const c of topLevel) {
        c.replies = byParent.get(c.id) || [];
      }

      setComments(topLevel);
    }
    setLoading(false);
  }, [supabase, taskId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchComments();
  }, [fetchComments]);

  // Real-time: refetch comments when any comment for this task changes
  useRealtime({
    table: "comments",
    filter: `entity_id=eq.${taskId}`,
    onPayload: () => {
      fetchComments();
    },
  });

  async function addComment(body: string, parentId?: string, agentId?: string) {
    const mentions = parseMentions(body);
    const { data: inserted, error } = await supabase.from("comments").insert({
      entity_type: "task",
      entity_id: taskId,
      parent_id: parentId || null,
      actor_type: agentId ? "agent" : "human",
      actor_agent_id: agentId || null,
      body,
      mentions,
    }).select("id").single();
    if (!error && inserted) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "comment",
        entity_id: inserted.id,
        action: "created",
        summary: `Added comment on task`,
        actor_agent_id: agentId,
      });
      fetchComments();
    }
  }

  async function editComment(id: string, body: string) {
    const mentions = parseMentions(body);
    const { error } = await supabase
      .from("comments")
      .update({ body, mentions })
      .eq("id", id);
    if (!error) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "comment",
        entity_id: id,
        action: "updated",
        summary: `Edited comment on task`,
      });
      fetchComments();
    }
  }

  async function updateCommentMeta(id: string, meta: Record<string, unknown>) {
    const { error } = await supabase
      .from("comments")
      .update({ meta })
      .eq("id", id);
    if (!error) fetchComments();
  }

  async function deleteComment(id: string) {
    await supabase.from("comments").delete().eq("id", id);
    logAudit(supabase, {
      module: "tasks",
      entity_type: "comment",
      entity_id: id,
      action: "deleted",
      summary: `Deleted comment`,
    });
    fetchComments();
  }

  return {
    comments,
    loading,
    actions: {
      addComment,
      editComment,
      updateCommentMeta,
      deleteComment,
      fetchComments,
    },
    parseMentions,
  };
}
