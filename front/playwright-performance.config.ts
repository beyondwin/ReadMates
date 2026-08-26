import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PERFORMANCE_PORT ?? 3200);
// Host and admin production-preview budgets. Vite-only visual-authority browsers live in playwright.config.ts.

export default defineConfig({
  testDir: ".",
  testMatch: [
    "tests/performance/host-meeting-workspace-performance.spec.ts",
    "tests/performance/admin-editorial-ledger-performance.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "output/performance/test-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium-performance",
      testMatch: ["tests/performance/host-meeting-workspace-performance.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-admin-performance",
      testMatch: ["tests/performance/admin-editorial-ledger-performance.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm preview --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
