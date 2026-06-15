import { Template, defaultBuildLogger } from "e2b";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

// Resolve the gateway image tag from the git tag (v0.2.0 → 0.2.0) so the
// E2B template is pinned to the exact release that was just published.
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

console.log("[e2b] Reading gateway/Dockerfile.e2b...");
let dockerfile = readFileSync("gateway/Dockerfile.e2b", "utf-8");
dockerfile = dockerfile.replace(/^ARG GATEWAY_TAG=.*$/m, `ARG GATEWAY_TAG=${gatewayTag}`);
console.log(`[e2b] Dockerfile loaded (${dockerfile.split("\n").length} lines)`);

console.log("[e2b] Parsing Dockerfile into template definition...");
// skipCache: E2B caches the FROM layer by tag string, not digest — so after
// a release republishes a tag, a cached build silently reuses the OLD base
// image. Skip cache so the base is always re-pulled fresh.
const template = Template({ fileContextPath: "." }).skipCache().fromDockerfile(dockerfile);
console.log("[e2b] Template definition ready");

console.log("[e2b] Starting build (alias=yourhq-gateway, 2 vCPU, 4096 MB)...");
console.log("[e2b] This typically takes 5-10 minutes.\n");

const startTime = Date.now();
const logger = defaultBuildLogger();

const result = await Template.build(template, {
  alias: "yourhq-gateway",
  cpuCount: 2,
  memoryMB: 4096,
  onBuildLogs: logger,
});

const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
console.log(`\n[e2b] Build completed in ${elapsed}s`);
console.log(`[e2b] Template ID: ${result?.templateId ?? "unknown"}`);
console.log("[e2b] Done.");
