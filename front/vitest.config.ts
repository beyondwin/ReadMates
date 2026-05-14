import path from "node:path";
import { defineConfig } from "vitest/config";

const frontRoot = path.resolve(__dirname);

export default defineConfig({
  root: frontRoot,
  cacheDir: path.resolve(frontRoot, "node_modules/.vite"),
  resolve: {
    alias: {
      "@": frontRoot,
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "src/**/*.{ts,tsx}",
        "features/**/*.{ts,tsx}",
        "shared/**/*.{ts,tsx}",
        "functions/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "tests/**",
        "node_modules/**",
        "dist/**",
      ],
      // baseline. 측정 후 Task 4에서 실측치로 조정.
      thresholds: {
        lines: 0,
        statements: 0,
        functions: 0,
        branches: 0,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          exclude: [
            "tests/unit/**/*.test.tsx",
            "tests/unit/cloudflare-*.test.ts",
            "tests/unit/client-redirect-guard.test.ts",
            "tests/unit/current-session-actions.test.ts",
            "tests/unit/host-invitation-actions.test.ts",
            "tests/unit/member-app-access.test.ts",
            "tests/unit/proxy-bff-secret.test.ts",
            "tests/unit/readmates-fetch.test.ts",
            "tests/unit/route-continuity.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: [
            "tests/unit/**/*.test.tsx",
            "tests/unit/cloudflare-*.test.ts",
            "tests/unit/client-redirect-guard.test.ts",
            "tests/unit/current-session-actions.test.ts",
            "tests/unit/host-invitation-actions.test.ts",
            "tests/unit/member-app-access.test.ts",
            "tests/unit/proxy-bff-secret.test.ts",
            "tests/unit/readmates-fetch.test.ts",
            "tests/unit/route-continuity.test.ts",
          ],
          setupFiles: ["./tests/setup.ts"],
        },
      },
    ],
  },
});
