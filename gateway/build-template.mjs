import { Template, defaultBuildLogger } from "e2b";
import { readFileSync } from "node:fs";

const dockerfile = readFileSync("gateway/Dockerfile", "utf-8");

const template = Template({ fileContextPath: "." }).fromDockerfile(dockerfile);

await Template.build(template, {
  alias: "yourhq-gateway",
  cpuCount: 2,
  memoryMB: 4096,
  onBuildLogs: defaultBuildLogger,
});

console.log("Template built successfully: yourhq-gateway");
