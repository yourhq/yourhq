import { Template, defaultBuildLogger } from "e2b";
import { readFileSync } from "node:fs";

console.log("[e2b] Reading gateway/Dockerfile...");
const dockerfile = readFileSync("gateway/Dockerfile", "utf-8");
console.log(`[e2b] Dockerfile loaded (${dockerfile.split("\n").length} lines)`);

console.log("[e2b] Parsing Dockerfile into template definition...");
const template = Template({ fileContextPath: "." }).fromDockerfile(dockerfile);
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
