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
      // baseline: 현재 측정치 -2pp (정수 내림). 회귀 차단 게이트.
      // vitest 4의 v8 커버리지는 AST 기반 리매핑이 기본이라 v3 대비 측정치가
      // 더 정확(보수적)하게 낮아졌다. 테스트 수는 동일하며 baseline만 재보정함.
      thresholds: {
        lines: 80,
        statements: 79,
        functions: 80,
        branches: 75,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "tests/lighthouse/**/*.test.ts",
            "tests/performance/**/*.test.ts",
            "tests/unit/**/*.test.ts",
            "src/**/*.test.ts",
            "features/**/*.test.ts",
            "shared/**/*.test.ts",
          ],
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
            "src/**/*.test.tsx",
            "features/**/*.test.tsx",
            "shared/**/*.test.tsx",
          ],
          setupFiles: ["./tests/setup.ts"],
        },
      },
    ],
  },
});
