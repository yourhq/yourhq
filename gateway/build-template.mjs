import { Template, defaultBuildLogger } from "e2b";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const VARIANTS = {
  standard: { alias: "yourhq-gateway", cpuCount: 2, memoryMB: 4096 },
  xl: { alias: "yourhq-gateway-xl", cpuCount: 4, memoryMB: 8192 },
};

const variantName = process.env.E2B_VARIANT || "standard";
const variant = VARIANTS[variantName];
if (!variant) {
  console.error(`Unknown variant "${variantName}". Valid: ${Object.keys(VARIANTS).join(", ")}`);
  process.exit(1);
}

let gatewayTag = process.env.GATEWAY_TAG || "";
if (!gatewayTag) {
  try {
    const raw = execSync("git describe --tags --abbrev=0", { encoding: "utf-8" }).trim();
    gatewayTag = raw.replace(/^v/, "");
  } catch {
    gatewayTag = "latest";
  }
}
console.log(`[e2b] Using gateway base image tag: ${gatewayTag}`);
console.log(`[e2b] Variant: ${variantName} (${variant.cpuCount} vCPU, ${variant.memoryMB} MB)`);

console.log("[e2b] Reading gateway/Dockerfile.e2b...");
let dockerfile = readFileSync("gateway/Dockerfile.e2b", "utf-8");
dockerfile = dockerfile.replace(/^ARG GATEWAY_TAG=.*\n?/m, "");
dockerfile = dockerfile.replaceAll("${GATEWAY_TAG}", gatewayTag);
console.log(`[e2b] Dockerfile loaded (${dockerfile.split("\n").length} lines)`);

// skipCache: E2B caches the FROM layer by tag string, not digest — so after
// a release republishes a tag, a cached build silently reuses the OLD base
// image. Skip cache so the base is always re-pulled fresh.
const template = Template({ fileContextPath: "." }).skipCache().fromDockerfile(dockerfile);

console.log(`[e2b] Starting build (alias=${variant.alias})...`);
console.log("[e2b] This typically takes 5-10 minutes.\n");

const startTime = Date.now();

const result = await Template.build(template, {
  alias: variant.alias,
  cpuCount: variant.cpuCount,
  memoryMB: variant.memoryMB,
  onBuildLogs: defaultBuildLogger(),
});

const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
console.log(`\n[e2b] Build completed in ${elapsed}s`);
console.log(`[e2b] Template ID: ${result?.templateId ?? "unknown"}`);
console.log("[e2b] Done.");
