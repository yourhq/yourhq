"use server";

// Connections — server actions.
//
// All connection state lives on the gateway. The UI's job is to enqueue
// commands and read back results. We don't cache profiles in Supabase;
// the list page calls `auth_list` on mount and the runner publishes the
// JSON via agent_commands.stdout.
//
// Two enqueue helpers:
//   - enqueueConnectionCommand: returns the new commandId. Caller polls
//     or subscribes for completion.
//   - waitForCommand: small server-side wait helper for the api_key path
//     where the round-trip is fast enough we don't need realtime.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/supabase/require-auth";
import {
  CONNECTION_COMMAND_ACTIONS,
  type AgentCommand,
  type CommandAction,
} from "@/lib/agents/types";
import type { Connection } from "@/lib/connections/types";
import { parseModelsStatus } from "@/lib/connections/parse-status";

export interface EnqueueConnectionCommandInput {
  gatewayId: string;
  action: CommandAction;
  payload?: Record<string, unknown>;
}

export interface EnqueueConnectionCommandResult {
  commandId: string;
}

interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

export async function enqueueConnectionCommand(
  input: EnqueueConnectionCommandInput,
): Promise<ActionResult<EnqueueConnectionCommandResult>> {
  if (!CONNECTION_COMMAND_ACTIONS.includes(input.action)) {
    return { ok: false, error: `Not a connection action: ${input.action}` };
  }
  if (!input.gatewayId) {
    return { ok: false, error: "Missing gatewayId" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data, error } = await supabase
    .from("agent_commands")
    .insert({
      gateway_id: input.gatewayId,
      action: input.action,
      payload: input.payload ?? {},
      requested_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to enqueue command" };
  }

  return { ok: true, data: { commandId: data.id } };
}

// Polls Supabase for a command to finish. Used by the api_key path where
// the runner usually completes in <1s. Returns the final command row or
// null if the timeout fires (caller should treat as "still running").
export async function waitForCommand(
  commandId: string,
  timeoutMs = 30_000,
): Promise<ActionResult<AgentCommand>> {
  await requireAuth();
  const supabase = await createAdminClient();
  const start = Date.now();
  const interval = 500;

  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabase
      .from("agent_commands")
      .select("*")
      .eq("id", commandId)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (data && (data.status === "done" || data.status === "failed")) {
      return { ok: true, data: data as unknown as AgentCommand };
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return { ok: false, error: "Command did not complete within timeout." };
}

// Fetches a single command — used by polling effects that watch
// connection_state on the payload during interactive flows.
export async function getCommandAction(
  commandId: string,
): Promise<ActionResult<AgentCommand>> {
  await requireAuth();
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("agent_commands")
    .select("*")
    .eq("id", commandId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Command not found." };
  return { ok: true, data: data as unknown as AgentCommand };
}

// Reads the most recent successful auth_list command for a gateway and
// parses its stdout into Connection[]. If none exists yet, returns null
// — caller should kick off a fresh auth_list and wait.
export async function readConnectionsForGateway(
  gatewayId: string,
): Promise<ActionResult<{ connections: Connection[]; lastCheckedAt: string | null }>> {
  await requireAuth();
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("agent_commands")
    .select("stdout, completed_at")
    .eq("gateway_id", gatewayId)
    .eq("action", "auth_list")
    .eq("status", "done")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, data: { connections: [], lastCheckedAt: null } };

  return {
    ok: true,
    data: {
      connections: parseModelsStatus(data.stdout, gatewayId),
      lastCheckedAt: data.completed_at,
    },
  };
}

// Enqueues an auth_list command and waits for it to finish, returning
// fresh parsed connections. Used by the list page on mount + after
// add/remove/refresh actions.
export async function refreshConnectionsAction(
  gatewayId: string,
): Promise<ActionResult<{ connections: Connection[] }>> {
  const enq = await enqueueConnectionCommand({
    gatewayId,
    action: "auth_list",
  });
  if (!enq.ok || !enq.data) {
    return { ok: false, error: enq.error };
  }
  // auth_list runs `models status --probe`, which can take a while if
  // multiple providers need network probes. Give it 60s.
  const wait = await waitForCommand(enq.data.commandId, 60_000);
  if (!wait.ok || !wait.data) {
    return { ok: false, error: wait.error ?? "auth_list did not complete" };
  }
  if (wait.data.status === "failed") {
    return {
      ok: false,
      error: wait.data.error_message ?? "Failed to list connections",
    };
  }
  return {
    ok: true,
    data: { connections: parseModelsStatus(wait.data.stdout, gatewayId) },
  };
}
