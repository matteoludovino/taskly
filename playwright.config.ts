import { defineConfig, devices } from "@playwright/test";

// End-to-end runs against the production builds (npm run build first): the bundled API and `next start`,
// on their usual ports, with a database of their own.
const E2E_DATABASE_URL =
  process.env["E2E_DATABASE_URL"] ?? "postgresql://taskly:taskly@localhost:5438/taskly_e2e";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3020",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "npm run start -w @taskly/server",
      url: "http://localhost:8030/api/health",
      env: { DATABASE_URL: E2E_DATABASE_URL, WEB_ORIGINS: "http://localhost:3020", LOG_LEVEL: "warn" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run start -w @taskly/web",
      url: "http://localhost:3020",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
