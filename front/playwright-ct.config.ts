import { defineConfig, devices } from "@playwright/experimental-ct-react";
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
    ctTemplateDir: "playwright",
    ctPort: 3110,
    ctViteConfig: {
      resolve: {
        alias: { "@": frontRoot },
      },
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
