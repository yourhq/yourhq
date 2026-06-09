import { Template, defaultBuildLogger } from "e2b";
import { readFileSync } from "node:fs";

console.log("[e2b] Reading gateway/Dockerfile.e2b...");
const dockerfile = readFileSync("gateway/Dockerfile.e2b", "utf-8");
console.log(`[e2b] Dockerfile loaded (${dockerfile.split("\n").length} lines)`);

console.log("[e2b] Parsing Dockerfile into template definition...");
// skipCache: Dockerfile.e2b does `FROM ghcr.io/yourhq/yourhq-gateway:latest`.
// E2B caches the FROM layer by tag string, not digest — so after a release
// republishes :latest, a cached build silently reuses the OLD base image
// (this shipped a stale gateway once). Skip cache so the base is always
// re-pulled fresh. Releases are infrequent; correctness > a few minutes.
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
