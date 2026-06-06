import { defineConfig, devices } from "@playwright/experimental-ct-react";
import react from "@vitejs/plugin-react";
import path from "node:path";

const frontRoot = path.resolve(__dirname);

export default defineConfig({
  testDir: ".",
  testMatch: ["**/*.ct.tsx"],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: {
    ctViewport: { width: 480, height: 360 },
    ctTemplateDir: "playwright",
    ctVitePort: 3110,
    ctViteConfig: {
      resolve: {
        alias: { "@": frontRoot },
      },
      plugins: [react()],
    },
    trace: "on-first-retry",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
