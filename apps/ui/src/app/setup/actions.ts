"use server";

import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/log";
import {
  PIPELINE_TEMPLATES,
  FIELD_TEMPLATES,
  DEFAULT_STREAMS,
} from "@/lib/setup/templates";

export interface SetupPayload {
  name: string;
  slug: string;
  description: string;
  ownerName: string;
  preferredName: string;
  timezone: string;
  pipelineTemplateKey: string;
  fieldTemplateKey: string;
  streamNames: string[];
}

export async function completeSetup(payload: SetupPayload) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Resolve templates
  const pipelineTemplate = PIPELINE_TEMPLATES.find(
    (t) => t.key === payload.pipelineTemplateKey
  );
  if (!pipelineTemplate) throw new Error("Invalid pipeline template");

  const fieldTemplate = FIELD_TEMPLATES.find(
    (t) => t.key === payload.fieldTemplateKey
  );
  if (!fieldTemplate) throw new Error("Invalid field template");

  // Resolve enabled streams (default + any custom the user added)
  const enabledStreams = DEFAULT_STREAMS.filter((s) =>
    payload.streamNames.includes(s.name)
  );
  // Add custom streams (names not in DEFAULT_STREAMS)
  const defaultNames = new Set(DEFAULT_STREAMS.map((s) => s.name));
  const customStreams = payload.streamNames
    .filter((name) => !defaultNames.has(name))
    .map((name, i) => ({
      name,
      description: null,
      type: "custom" as const,
      color: "#6b7280",
      icon: null,
      sort_order: enabledStreams.length + i,
    }));
  const allStreams = [...enabledStreams, ...customStreams];

  // Build JSONB arrays for the RPC call
  const stagesJson = pipelineTemplate.stages.map((s) => ({
    stage_key: s.stage_key,
    label: s.label,
    color: s.color,
    sort_order: s.sort_order,
    is_terminal: s.is_terminal,
    is_default: s.is_default,
  }));

  const fieldsJson = fieldTemplate.fields.map((f) => ({
    field_key: f.field_key,
    field_type: f.field_type,
    label: f.label,
    field_group: f.field_group,
    sort_order: f.sort_order,
    required: f.required,
    options: f.options,
    description: f.description,
  }));

  const streamsJson = allStreams.map((s) => ({
    name: s.name,
    description: s.description,
    type: s.type,
    color: s.color,
    icon: s.icon,
    sort_order: s.sort_order,
  }));

  const { error } = await supabase.rpc("complete_setup", {
    p_name: payload.name.trim() || "HQ",
    p_slug: payload.slug.trim() || null,
    p_description: payload.description.trim(),
    p_owner_name: payload.ownerName.trim(),
    p_preferred_name: payload.preferredName.trim(),
    p_timezone: payload.timezone.trim(),
    p_stages: stagesJson,
    p_fields: fieldsJson,
    p_streams: streamsJson,
  });

  if (error) throw new Error(error.message);

  // Get workspace ID for audit log
  const { data: workspace } = await supabase
    .from("workspace")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (workspace) {
    await logAudit(supabase, {
      module: "settings",
      entity_type: "workspace",
      entity_id: workspace.id,
      action: "created",
      summary: `Completed workspace setup: ${pipelineTemplate.label} pipeline, ${fieldTemplate.label} fields, ${allStreams.length} streams`,
    });
  }

  return { success: true };
}
