"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/supabase/require-auth";
import { enqueueAgentCommand } from "@/app/dashboard/agents/actions";
import type { Gateway } from "@/lib/gateways/types";

export interface BackupInfo {
  gatewayId: string;
  gatewaySlug: string;
  gatewayLabel: string;
  gatewayStatus: string;
  lastBackupAt: string | null;
  lastBackupSizeBytes: number | null;
  lastSeenAt: string | null;
}

export interface BackupActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

export async function listGatewayBackupsAction(): Promise<
  BackupActionResult<BackupInfo[]>
> {
  await requireAuth();
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("gateways")
    .select("id, slug, label, status, last_seen_at, last_backup_at, last_backup_size_bytes")
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const backups: BackupInfo[] = (data ?? []).map((gw: Record<string, unknown>) => ({
    gatewayId: gw.id as string,
    gatewaySlug: gw.slug as string,
    gatewayLabel: gw.label as string,
    gatewayStatus: gw.status as string,
    lastBackupAt: (gw.last_backup_at as string) ?? null,
    lastBackupSizeBytes: (gw.last_backup_size_bytes as number) ?? null,
    lastSeenAt: (gw.last_seen_at as string) ?? null,
  }));

  return { ok: true, data: backups };
}

export async function triggerBackupAction(
  gatewayId: string,
): Promise<BackupActionResult<{ commandId: string }>> {
  await requireAuth();
  const result = await enqueueAgentCommand({
    action: "backup_gateway",
    gatewayId,
  });
  return { ok: true, data: { commandId: result.commandId } };
}

export async function deleteBackupAction(
  gatewaySlug: string,
): Promise<BackupActionResult> {
  await requireAuth();
  const supabase = await createAdminClient();

  const { error: storageError } = await supabase.storage
    .from("gateway-backups")
    .remove([`${gatewaySlug}/state.tar.gz`]);

  if (storageError) return { ok: false, error: storageError.message };

  const { error: updateError } = await supabase
    .from("gateways")
    .update({ last_backup_at: null, last_backup_size_bytes: null })
    .eq("slug", gatewaySlug);

  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true };
}
