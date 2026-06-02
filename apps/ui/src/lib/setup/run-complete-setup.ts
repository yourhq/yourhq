import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PIPELINE_TEMPLATES,
  FIELD_TEMPLATES,
  DEFAULT_STREAMS,
  DEFAULT_CONTEXT_PRESET,
  findPreset,
} from "@/lib/setup/templates";

export async function runCompleteSetup(
  supabase: SupabaseClient,
  params: {
    workspaceName: string;
    workspaceSlug?: string | null;
    workspaceDescription?: string;
    ownerName?: string;
    preferredName?: string;
    timezone?: string;
    contextPresetKey?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const workspaceName = params.workspaceName || "HQ";
  const workspaceSlug = params.workspaceSlug ?? null;
  const workspaceDescription = params.workspaceDescription ?? "";
  const ownerName = params.ownerName ?? "";
  const preferredName = params.preferredName ?? ownerName;
  const timezone = params.timezone ?? "";

  const presetKey = params.contextPresetKey ?? null;
  const preset = presetKey ? findPreset(presetKey) : DEFAULT_CONTEXT_PRESET;

  const pipelineKey = preset.pipelineKey;
  const fieldKey = preset.fieldKey;
  const streamNames = preset.streamNames;

  const pipelineTemplate = PIPELINE_TEMPLATES.find((t) => t.key === pipelineKey);
  const fieldTemplate = FIELD_TEMPLATES.find((t) => t.key === fieldKey);
  if (!pipelineTemplate || !fieldTemplate) {
    return { ok: false, error: "Pipeline or field template not found" };
  }

  const enabledStreams = DEFAULT_STREAMS.filter((s) => streamNames.includes(s.name));
  const defaultNames = new Set(DEFAULT_STREAMS.map((s) => s.name));
  const customStreams = streamNames
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
    p_name: workspaceName,
    p_slug: workspaceSlug,
    p_description: workspaceDescription,
    p_owner_name: ownerName,
    p_preferred_name: preferredName,
    p_timezone: timezone,
    p_stages: stagesJson,
    p_fields: fieldsJson,
    p_streams: streamsJson,
    p_tenant_id: "00000000-0000-0000-0000-000000000000",
  });
  if (error) return { ok: false, error: error.message };

  const modules = preset.modules ?? { crm: true };
  await supabase
    .from("workspace")
    .update({
      settings: { modules },
    })
    .eq("tenant_id", "00000000-0000-0000-0000-000000000000");

  if (preset.collectionTemplateSlugs?.length) {
    for (const slug of preset.collectionTemplateSlugs) {
      const { data: tpl } = await supabase
        .from("collection_templates")
        .select("definition")
        .eq("slug", slug)
        .maybeSingle();
      if (!tpl?.definition) continue;

      const def = tpl.definition as {
        name?: string;
        description?: string;
        icon?: string;
        color?: string;
        fields?: Array<Record<string, unknown>>;
        views?: Array<Record<string, unknown>>;
      };

      const { data: existing } = await supabase
        .from("collection_definitions")
        .select("id")
        .eq("slug", slug)
        .eq("tenant_id", "00000000-0000-0000-0000-000000000000")
        .maybeSingle();
      if (existing) continue;

      const { data: created } = await supabase
        .from("collection_definitions")
        .insert({
          name: def.name ?? slug,
          slug,
          description: def.description ?? null,
          icon: def.icon ?? null,
          color: def.color ?? "#6b7280",
          tenant_id: "00000000-0000-0000-0000-000000000000",
        })
        .select("id")
        .single();
      if (!created) continue;

      if (def.fields?.length) {
        await supabase.from("collection_fields").insert(
          def.fields.map((f, i) => ({
            collection_id: created.id,
            field_key: f.field_key,
            field_type: f.field_type,
            label: f.label,
            sort_order: f.sort_order ?? i,
            required: f.required ?? false,
            options: f.options ?? null,
            is_title_field: f.is_title_field ?? false,
            tenant_id: "00000000-0000-0000-0000-000000000000",
          })),
        );
      }

      if (def.views?.length) {
        await supabase.from("collection_views").insert(
          def.views.map((v, i) => ({
            collection_id: created.id,
            name: v.name,
            view_type: v.view_type,
            config: v.config ?? {},
            is_default: v.is_default ?? i === 0,
            sort_order: v.sort_order ?? i,
            tenant_id: "00000000-0000-0000-0000-000000000000",
          })),
        );
      }
    }
  }

  return { ok: true };
}
