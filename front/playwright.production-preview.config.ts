import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.READMATES_PRODUCTION_PREVIEW_URL;

if (!baseURL) {
  throw new Error("READMATES_PRODUCTION_PREVIEW_URL must point to an isolated vite preview server.");
}

export default defineConfig({
  testDir: ".",
  testMatch: ["tests/e2e/living-archive-preview.spec.ts"],
  fullyParallel: true,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
