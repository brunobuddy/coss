import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.e2e.ts",
  // Outside the app: `next dev` reloads every open page when files under it change.
  outputDir: "../../node_modules/.cache/coss-e2e",
  // Next compiles each route on its first visit.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: "bun run dev",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Whatever the shell exports, a test run never reaches a real provider.
    env: {
      EMAIL_PROVIDER: "fake",
      SMS_PROVIDER: "fake",
      BILLING_PROVIDER: "fake",
      TRACKING_DOMAIN_PROVIDER: "fake",
    },
  },
});
