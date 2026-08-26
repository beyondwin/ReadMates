import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PERFORMANCE_PORT ?? 3200);
// Host production-preview budget. Vite-only visual-authority browsers live in playwright.config.ts.

export default defineConfig({
  testDir: ".",
  testMatch: ["tests/performance/host-meeting-workspace-performance.spec.ts"],
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
  projects: [{ name: "chromium-performance", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm preview --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
