import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: ".",
  testMatch: [
    "specs/**/*.spec.ts",
    "journeys/**/*.spec.ts",
  ],
  grep: process.env.E2E_LIVE ? undefined : /^(?!.*@live)/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "on-failure" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "setup",
      testMatch: "specs/00-onboarding.spec.ts",
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: "specs/!(00-)*.spec.ts",
    },
    {
      name: "live",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testMatch: "journeys/**/*.spec.ts",
      timeout: 200_000,
    },
  ],
});
