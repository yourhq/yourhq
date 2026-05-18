import { describe, test, expect } from "vitest";
import {
  PROVIDER_MANIFESTS,
  PROVIDER_IDS,
} from "@/lib/sources/generated-manifests";
import {
  getSourceUrl,
  PROVIDER_LABELS,
  CONNECTION_STATUS_LABELS,
  CONNECTION_STATUS_COLORS,
} from "@/lib/sources/types";

describe("PROVIDER_MANIFESTS", () => {
  test("contains at least one provider", () => {
    expect(Object.keys(PROVIDER_MANIFESTS).length).toBeGreaterThan(0);
  });

  test("each manifest has required fields", () => {
    for (const [id, manifest] of Object.entries(PROVIDER_MANIFESTS)) {
      expect(manifest.id).toBe(id);
      expect(manifest.name).toBeTruthy();
      expect(manifest.description).toBeTruthy();
      expect(manifest.icon).toBeTruthy();
      expect(manifest.auth).toBeDefined();
      expect(manifest.auth.type).toBeTruthy();
      expect(Array.isArray(manifest.auth.fields)).toBe(true);
      expect(Array.isArray(manifest.auth.setup_steps)).toBe(true);
      expect(typeof manifest.supports_write).toBe("boolean");
    }
  });

  test("notion manifest is present and correct", () => {
    const notion = PROVIDER_MANIFESTS["notion"];
    expect(notion).toBeDefined();
    expect(notion.name).toBe("Notion");
    expect(notion.auth.type).toBe("api_key");
    expect(notion.source_url_template).toContain("{external_id_no_dashes}");
  });
});

describe("PROVIDER_IDS", () => {
  test("matches keys of PROVIDER_MANIFESTS", () => {
    expect(PROVIDER_IDS.sort()).toEqual(Object.keys(PROVIDER_MANIFESTS).sort());
  });
});

describe("getSourceUrl", () => {
  test("generates correct Notion URL", () => {
    const url = getSourceUrl("notion", "abc-def-123");
    expect(url).toBe("https://notion.so/abcdef123");
  });

  test("returns empty string for unknown provider", () => {
    expect(getSourceUrl("unknown-provider", "123")).toBe("");
  });

  test("returns empty string when provider has no template", () => {
    const manifest = PROVIDER_MANIFESTS["notion"];
    const origTemplate = manifest.source_url_template;

    // Temporarily test the fallback path
    (manifest as any).source_url_template = undefined;
    expect(getSourceUrl("notion", "123")).toBe("");
    (manifest as any).source_url_template = origTemplate;
  });

  test("replaces {external_id} placeholder", () => {
    // The notion template uses {external_id_no_dashes} but test both patterns
    const url = getSourceUrl("notion", "test-id-with-dashes");
    expect(url).not.toContain("{external_id_no_dashes}");
    expect(url).toContain("testidwithdashes");
  });
});

describe("PROVIDER_LABELS", () => {
  test("has a label for each provider", () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDER_LABELS[id]).toBeTruthy();
    }
  });

  test("notion label is 'Notion'", () => {
    expect(PROVIDER_LABELS["notion"]).toBe("Notion");
  });
});

describe("CONNECTION_STATUS_LABELS", () => {
  test("covers all statuses", () => {
    expect(CONNECTION_STATUS_LABELS.active).toBe("Active");
    expect(CONNECTION_STATUS_LABELS.expired).toBe("Expired");
    expect(CONNECTION_STATUS_LABELS.revoked).toBe("Revoked");
    expect(CONNECTION_STATUS_LABELS.error).toBe("Error");
  });
});

describe("CONNECTION_STATUS_COLORS", () => {
  test("all statuses have CSS classes", () => {
    for (const status of ["active", "expired", "revoked", "error"] as const) {
      expect(CONNECTION_STATUS_COLORS[status]).toBeTruthy();
    }
  });
});
