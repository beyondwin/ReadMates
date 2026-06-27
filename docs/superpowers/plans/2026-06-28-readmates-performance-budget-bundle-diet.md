# ReadMates Performance Budget And Bundle Diet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-build performance budget evidence, reduce the largest frontend chunks, and connect Lighthouse diagnostics to a build/preview path without changing ReadMates product behavior.

**Architecture:** Keep route-first frontend ownership intact while adding a pure build-budget analyzer under `front/tests/performance` and thin CLIs under `front/scripts`. Split the current host route aggregation into route-specific lazy entry modules, then run build-budget and preview Lighthouse evidence from generated `.tmp/performance` artifacts. The work is frontend/docs/tooling only and does not touch server API, DB migrations, BFF trusted headers, auth, OAuth, or deploy image behavior.

**Tech Stack:** Vite 8/Rolldown, React 19, React Router 7, TanStack Query 5, Vitest 4, Playwright/Lighthouse diagnostics, Node built-in `fs`, `path`, `child_process`, and repo-pinned `pnpm@10.33.0`.

## Global Constraints

- No new product route, user-facing workflow, server API contract, DB migration, auth/BFF behavior, OAuth scope, Cloudflare Pages Functions behavior, or deploy image behavior.
- Keep frontend dependency direction: `src/app -> src/pages -> features -> shared`; UI stays props/callback driven and must not import API/query modules directly.
- Keep generated performance artifacts under `.tmp/performance/`; do not commit build, Lighthouse, screenshot, or preview artifacts.
- Do not add real member data, private domains, local absolute paths, deployment state, OCIDs, secrets, or token-shaped examples.
- Use repo-pinned package manager commands when invoking pnpm from automation: `npx --yes pnpm@10.33.0 ...`.
- Initial budget policy: no hard-gated JS chunk above 350 kB after minification; host route chunks target 120 kB; ordinary route chunks target 80 kB; global CSS is measured but not hard-failed in this iteration.
- Public release candidate must continue excluding generated performance artifacts and `front/__screenshots__`.

---

## File Structure

- Create `front/tests/performance/build-budget.ts`: pure asset classification, budget evaluation, JSON/Markdown report formatting, and byte formatting.
- Create `front/tests/performance/build-budget.test.ts`: Vitest coverage for bucket classification, hard failure behavior, measured CSS behavior, and report output.
- Create `front/scripts/build-budget.ts`: CLI that reads `front/dist/assets`, invokes the pure analyzer, writes `.tmp/performance/build-budget.{json,md}`, and exits non-zero on hard failures.
- Modify `front/package.json`: add `build:budget` and `performance:budget` scripts.
- Modify root `package.json`: add `front:performance-budget` alias.
- Modify `front/vite.config.ts`: split the current single `vendor` group into framework/vendor buckets.
- Create `front/src/app/host-route-invalidation.ts`: shared hook for session-record invalidation used by host session editor entry modules.
- Create route-specific host element modules under `front/src/app/host-routes/`: `dashboard-route-element.tsx`, `members-route-element.tsx`, `invitations-route-element.tsx`, `notifications-route-element.tsx`, `session-closing-route-element.tsx`, `new-session-route-element.tsx`, `edit-session-route-element.tsx`.
- Modify `front/src/app/routes/host.tsx`: import route-specific host entry modules in each React Router `lazy` block instead of importing `front/src/app/host-route-elements.tsx`.
- Delete `front/src/app/host-route-elements.tsx` after route-specific entry modules fully replace it.
- Modify `front/src/app/router-route-order.test.tsx`: add route matching assertions for new/edit/closing host route paths.
- Create `front/tests/performance/lighthouse-preview.ts`: pure helper for preview command arguments and output paths.
- Create `front/tests/performance/lighthouse-preview.test.ts`: Vitest coverage for preview base URL, output directory, and command construction.
- Create `front/scripts/lighthouse-preview.ts`: CLI that builds, starts Vite preview, runs existing Lighthouse diagnostic against preview base URL, and stops preview.
- Modify `front/scripts/lighthouse-diagnostic.ts`: accept `LIGHTHOUSE_OUTPUT_DIR` and `LIGHTHOUSE_SERVER_PROFILE` env overrides so preview mode can reuse it without duplicating runner logic.
- Modify `front/tests/lighthouse/report-writer.test.ts`: assert preview server profile appears in summary output.
- Modify `front/package.json`: add `lighthouse:preview`.
- Modify root `package.json`: add `front:lighthouse:preview`.
- Create `docs/development/performance-budget.md`: command guide, budget interpretation, evidence limits, and future CSS boundary note.
- Modify `docs/development/release-readiness-review.md`: add closeout note after implementation evidence is produced.
- Modify `CHANGELOG.md`: record frontend performance budget tooling and bundle-diet confidence under `Unreleased`.

---

### Task 1: Build Budget Analyzer And CLI

**Files:**
- Create: `front/tests/performance/build-budget.ts`
- Create: `front/tests/performance/build-budget.test.ts`
- Create: `front/scripts/build-budget.ts`
- Modify: `front/package.json`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `type BudgetBucket = "vendor-framework" | "vendor-misc" | "host-route" | "route" | "app-entry" | "css-global" | "uncategorized"`
  - `function analyzeBuildAssets(files: BuildAssetInput[], budgets?: BudgetRule[]): BuildBudgetReport`
  - `function renderBuildBudgetMarkdown(report: BuildBudgetReport): string`
  - CLI: `npx --yes pnpm@10.33.0 --dir front build:budget`
- Consumes: Vite build output under `front/dist/assets`.

- [ ] **Step 1: Write the failing build budget unit test**

Create `front/tests/performance/build-budget.test.ts` with this content:

```ts
import { describe, expect, it } from "vitest";
import {
  analyzeBuildAssets,
  defaultBudgetRules,
  formatBytes,
  renderBuildBudgetMarkdown,
  type BuildAssetInput,
} from "./build-budget";

const assets: BuildAssetInput[] = [
  { fileName: "vendor-react-abc.js", bytes: 140_000, gzipBytes: 45_000 },
  { fileName: "vendor-misc-def.js", bytes: 220_000, gzipBytes: 72_000 },
  { fileName: "host-dashboard-route-aaa.js", bytes: 118_000, gzipBytes: 36_000 },
  { fileName: "host-session-editor-route-bbb.js", bytes: 135_000, gzipBytes: 41_000 },
  { fileName: "public-home-ccc.js", bytes: 31_000, gzipBytes: 10_000 },
  { fileName: "index-entry.js", bytes: 73_000, gzipBytes: 18_000 },
  { fileName: "index-style.css", bytes: 104_000, gzipBytes: 18_000 },
  { fileName: "unexpected-worker.js", bytes: 12_000, gzipBytes: 4_000 },
];

describe("build budget analyzer", () => {
  it("classifies production build assets into budget buckets", () => {
    const report = analyzeBuildAssets(assets, defaultBudgetRules);

    expect(report.assets.map((asset) => [asset.fileName, asset.bucket])).toEqual([
      ["vendor-react-abc.js", "vendor-framework"],
      ["vendor-misc-def.js", "vendor-misc"],
      ["host-dashboard-route-aaa.js", "host-route"],
      ["host-session-editor-route-bbb.js", "host-route"],
      ["public-home-ccc.js", "route"],
      ["index-entry.js", "app-entry"],
      ["index-style.css", "css-global"],
      ["unexpected-worker.js", "uncategorized"],
    ]);
  });

  it("fails hard-gated buckets and leaves measured CSS as a warning", () => {
    const report = analyzeBuildAssets(assets, defaultBudgetRules);

    expect(report.status).toBe("failed");
    expect(report.violations).toEqual([
      {
        bucket: "host-route",
        fileName: "host-session-editor-route-bbb.js",
        bytes: 135_000,
        limitBytes: 120_000,
        severity: "error",
      },
    ]);
    expect(report.warnings).toEqual([
      {
        bucket: "css-global",
        fileName: "index-style.css",
        bytes: 104_000,
        limitBytes: 100_000,
        severity: "warn",
      },
    ]);
  });

  it("renders a markdown report with largest assets and budget results", () => {
    const report = analyzeBuildAssets(assets, defaultBudgetRules);
    const markdown = renderBuildBudgetMarkdown(report);

    expect(markdown).toContain("# ReadMates Build Budget");
    expect(markdown).toContain("| host-route | host-session-editor-route-bbb.js | 135.0 kB | 41.0 kB | 120.0 kB | error |");
    expect(markdown).toContain("| css-global | index-style.css | 104.0 kB | 18.0 kB | 100.0 kB | warn |");
    expect(markdown).toContain("unexpected-worker.js");
  });

  it("formats bytes in stable base-10 units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1_500)).toBe("1.5 kB");
    expect(formatBytes(1_500_000)).toBe("1.5 MB");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front exec vitest run tests/performance/build-budget.test.ts
```

Expected: FAIL because `front/tests/performance/build-budget.ts` does not exist.

- [ ] **Step 3: Implement the analyzer**

Create `front/tests/performance/build-budget.ts` with this content:

```ts
export type BudgetBucket =
  | "vendor-framework"
  | "vendor-misc"
  | "host-route"
  | "route"
  | "app-entry"
  | "css-global"
  | "uncategorized";

export type BudgetSeverity = "error" | "warn" | "measure";

export type BuildAssetInput = {
  fileName: string;
  bytes: number;
  gzipBytes: number | null;
};

export type BudgetRule = {
  bucket: BudgetBucket;
  limitBytes: number;
  severity: BudgetSeverity;
};

export type ClassifiedBuildAsset = BuildAssetInput & {
  bucket: BudgetBucket;
  limitBytes: number | null;
  severity: BudgetSeverity;
};

export type BudgetFinding = {
  bucket: BudgetBucket;
  fileName: string;
  bytes: number;
  limitBytes: number;
  severity: Exclude<BudgetSeverity, "measure">;
};

export type BuildBudgetReport = {
  status: "passed" | "failed";
  generatedAt: string;
  assets: ClassifiedBuildAsset[];
  violations: BudgetFinding[];
  warnings: BudgetFinding[];
};

const jsChunkLimit = 350_000;

export const defaultBudgetRules: BudgetRule[] = [
  { bucket: "vendor-framework", limitBytes: jsChunkLimit, severity: "error" },
  { bucket: "vendor-misc", limitBytes: jsChunkLimit, severity: "error" },
  { bucket: "host-route", limitBytes: 120_000, severity: "error" },
  { bucket: "route", limitBytes: 80_000, severity: "warn" },
  { bucket: "app-entry", limitBytes: jsChunkLimit, severity: "error" },
  { bucket: "css-global", limitBytes: 100_000, severity: "warn" },
  { bucket: "uncategorized", limitBytes: jsChunkLimit, severity: "measure" },
];

function classifyAsset(fileName: string): BudgetBucket {
  if (fileName.endsWith(".css")) return "css-global";
  if (/^vendor-(react|router|query|framework)/.test(fileName)) return "vendor-framework";
  if (/^vendor-/.test(fileName)) return "vendor-misc";
  if (/^host-/.test(fileName) || /host.*route/.test(fileName)) return "host-route";
  if (/^index-/.test(fileName)) return "app-entry";
  if (fileName.endsWith(".js")) return "route";
  return "uncategorized";
}

function ruleFor(bucket: BudgetBucket, budgets: BudgetRule[]): BudgetRule {
  const rule = budgets.find((candidate) => candidate.bucket === bucket);
  if (!rule) {
    throw new Error(`Missing build budget rule for bucket ${bucket}`);
  }
  return rule;
}

function toFinding(asset: ClassifiedBuildAsset): BudgetFinding {
  if (asset.limitBytes === null || asset.severity === "measure") {
    throw new Error(`Cannot create budget finding for measured-only asset ${asset.fileName}`);
  }
  return {
    bucket: asset.bucket,
    fileName: asset.fileName,
    bytes: asset.bytes,
    limitBytes: asset.limitBytes,
    severity: asset.severity,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function analyzeBuildAssets(
  files: BuildAssetInput[],
  budgets: BudgetRule[] = defaultBudgetRules,
): BuildBudgetReport {
  const assets = files
    .filter((file) => file.fileName.endsWith(".js") || file.fileName.endsWith(".css"))
    .map((file) => {
      const bucket = classifyAsset(file.fileName);
      const rule = ruleFor(bucket, budgets);
      return {
        ...file,
        bucket,
        limitBytes: rule.limitBytes,
        severity: rule.severity,
      };
    })
    .sort((a, b) => b.bytes - a.bytes || a.fileName.localeCompare(b.fileName));

  const overBudget = assets.filter((asset) => asset.limitBytes !== null && asset.bytes > asset.limitBytes);
  const violations = overBudget.filter((asset) => asset.severity === "error").map(toFinding);
  const warnings = overBudget.filter((asset) => asset.severity === "warn").map(toFinding);

  return {
    status: violations.length === 0 ? "passed" : "failed",
    generatedAt: new Date().toISOString(),
    assets,
    violations,
    warnings,
  };
}

function findingRow(finding: BudgetFinding): string {
  return [
    finding.bucket,
    finding.fileName,
    formatBytes(finding.bytes),
    formatBytes(0),
    formatBytes(finding.limitBytes),
    finding.severity,
  ].join(" | ");
}

function assetRow(asset: ClassifiedBuildAsset): string {
  return [
    asset.bucket,
    asset.fileName,
    formatBytes(asset.bytes),
    asset.gzipBytes === null ? "n/a" : formatBytes(asset.gzipBytes),
    asset.limitBytes === null ? "n/a" : formatBytes(asset.limitBytes),
    asset.severity,
  ].join(" | ");
}

export function renderBuildBudgetMarkdown(report: BuildBudgetReport): string {
  const findingRows = [...report.violations, ...report.warnings].map((finding) => `| ${findingRow(finding)} |`);
  const budgetRows = findingRows.length
    ? findingRows
    : ["| none | none | n/a | n/a | n/a | passed |"];
  const assetRows = report.assets.map((asset) => `| ${assetRow(asset)} |`);

  return [
    "# ReadMates Build Budget",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    "",
    "## Budget Results",
    "| bucket | file | bytes | gzip | limit | severity |",
    "| --- | --- | --- | --- | --- | --- |",
    ...budgetRows,
    "",
    "## Largest Assets",
    "| bucket | file | bytes | gzip | limit | policy |",
    "| --- | --- | --- | --- | --- | --- |",
    ...assetRows,
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run the analyzer test and fix the gzip value bug**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front exec vitest run tests/performance/build-budget.test.ts
```

Expected: FAIL because `findingRow()` renders `0 B` for gzip in budget findings.

Replace `BudgetFinding` and `toFinding()` in `front/tests/performance/build-budget.ts` with:

```ts
export type BudgetFinding = {
  bucket: BudgetBucket;
  fileName: string;
  bytes: number;
  gzipBytes: number | null;
  limitBytes: number;
  severity: Exclude<BudgetSeverity, "measure">;
};

function toFinding(asset: ClassifiedBuildAsset): BudgetFinding {
  if (asset.limitBytes === null || asset.severity === "measure") {
    throw new Error(`Cannot create budget finding for measured-only asset ${asset.fileName}`);
  }
  return {
    bucket: asset.bucket,
    fileName: asset.fileName,
    bytes: asset.bytes,
    gzipBytes: asset.gzipBytes,
    limitBytes: asset.limitBytes,
    severity: asset.severity,
  };
}
```

Replace `findingRow()` with:

```ts
function findingRow(finding: BudgetFinding): string {
  return [
    finding.bucket,
    finding.fileName,
    formatBytes(finding.bytes),
    finding.gzipBytes === null ? "n/a" : formatBytes(finding.gzipBytes),
    formatBytes(finding.limitBytes),
    finding.severity,
  ].join(" | ");
}
```

Update the expected `report.violations` entry in `front/tests/performance/build-budget.test.ts` to include gzip bytes:

```ts
      {
        bucket: "host-route",
        fileName: "host-session-editor-route-bbb.js",
        bytes: 135_000,
        gzipBytes: 41_000,
        limitBytes: 120_000,
        severity: "error",
      },
```

Update the expected `report.warnings` entry to include gzip bytes:

```ts
      {
        bucket: "css-global",
        fileName: "index-style.css",
        bytes: 104_000,
        gzipBytes: 18_000,
        limitBytes: 100_000,
        severity: "warn",
      },
```

- [ ] **Step 5: Verify the analyzer test passes**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front exec vitest run tests/performance/build-budget.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add the build-budget CLI**

Create `front/scripts/build-budget.ts` with this content:

```ts
import { gzipSync } from "node:zlib";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  analyzeBuildAssets,
  renderBuildBudgetMarkdown,
  type BuildAssetInput,
} from "../tests/performance/build-budget";

const frontRoot = resolve(import.meta.dirname, "..");
const distAssetsDir = resolve(frontRoot, "dist", "assets");
const outputDir = resolve(frontRoot, "..", ".tmp", "performance");

async function readAssets(): Promise<BuildAssetInput[]> {
  const entries = await readdir(distAssetsDir);
  const assets: BuildAssetInput[] = [];
  for (const fileName of entries) {
    if (!fileName.endsWith(".js") && !fileName.endsWith(".css")) continue;
    const path = resolve(distAssetsDir, fileName);
    const [metadata, contents] = await Promise.all([stat(path), readFile(path)]);
    assets.push({
      fileName,
      bytes: metadata.size,
      gzipBytes: gzipSync(contents).byteLength,
    });
  }
  return assets;
}

async function run() {
  const assets = await readAssets();
  if (assets.length === 0) {
    throw new Error(`No JS/CSS assets found in ${distAssetsDir}. Run the frontend build first.`);
  }

  const report = analyzeBuildAssets(assets);
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "build-budget.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(resolve(outputDir, "build-budget.md"), renderBuildBudgetMarkdown(report), "utf8");
  console.log(`Build budget report written to ${resolve(outputDir, "build-budget.md")}`);

  if (report.status === "failed") {
    for (const violation of report.violations) {
      console.error(
        `Budget error: ${violation.fileName} in ${violation.bucket} is ${violation.bytes} bytes, limit ${violation.limitBytes}`,
      );
    }
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Add package scripts**

Modify `front/package.json` scripts by adding:

```json
"build:budget": "tsx scripts/build-budget.ts",
"performance:budget": "pnpm build && pnpm build:budget"
```

Modify root `package.json` scripts by adding:

```json
"front:performance-budget": "pnpm --dir front performance:budget"
```

- [ ] **Step 8: Run the budget command against the current build output**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front build
npx --yes pnpm@10.33.0 --dir front build:budget
```

Expected: `build` passes. `build:budget` may FAIL before Tasks 2 and 3 because the current `vendor` and host chunk shape has not been reduced yet. Confirm `.tmp/performance/build-budget.md` exists and names the failing chunks.

- [ ] **Step 9: Commit Task 1**

```bash
git add front/tests/performance/build-budget.ts front/tests/performance/build-budget.test.ts front/scripts/build-budget.ts front/package.json package.json
git commit -m "test(front): add build budget analyzer"
```

---

### Task 2: Vite Vendor Chunk Split

**Files:**
- Modify: `front/vite.config.ts`
- Test: existing Task 1 budget analyzer and production build output

**Interfaces:**
- Consumes: Task 1 `build:budget` CLI.
- Produces: Vite output chunks named by vendor group so budget classifier can distinguish framework vendor and miscellaneous vendor.

- [ ] **Step 1: Update Vite vendor chunk grouping**

Modify `front/vite.config.ts` `build.rolldownOptions.output.codeSplitting.groups` to:

```ts
groups: [
  {
    name: "vendor-react",
    test: /node_modules\/(react|react-dom)\//,
  },
  {
    name: "vendor-router",
    test: /node_modules\/(react-router|react-router-dom)\//,
  },
  {
    name: "vendor-query",
    test: /node_modules\/@tanstack\/react-query\//,
  },
  {
    name: "vendor-misc",
    test: /node_modules/,
  },
],
```

- [ ] **Step 2: Run production build**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front build
```

Expected: PASS. Output includes multiple `vendor-*` chunks and no single `vendor` chunk above 350 kB. If Rolldown rejects a regex path because of platform separators, change each regex to tolerate both `/` and `\\`, for example `/node_modules[\\/](react|react-dom)[\\/]/`, then rerun.

- [ ] **Step 3: Run build budget**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front build:budget
```

Expected: If the vendor warning is fixed but host route remains over budget, `build:budget` fails only for `host-route` and possibly warns for `css-global`. If vendor remains over budget, inspect `.tmp/performance/build-budget.md` and adjust the vendor groups before continuing.

- [ ] **Step 4: Commit Task 2**

```bash
git add front/vite.config.ts
git commit -m "build(front): split vendor chunks"
```

---

### Task 3: Host Route Entry Split

**Files:**
- Create: `front/src/app/host-route-invalidation.ts`
- Create: `front/src/app/host-routes/dashboard-route-element.tsx`
- Create: `front/src/app/host-routes/members-route-element.tsx`
- Create: `front/src/app/host-routes/invitations-route-element.tsx`
- Create: `front/src/app/host-routes/notifications-route-element.tsx`
- Create: `front/src/app/host-routes/session-closing-route-element.tsx`
- Create: `front/src/app/host-routes/new-session-route-element.tsx`
- Create: `front/src/app/host-routes/edit-session-route-element.tsx`
- Modify: `front/src/app/routes/host.tsx`
- Modify: `front/src/app/router-route-order.test.tsx`
- Delete: `front/src/app/host-route-elements.tsx`

**Interfaces:**
- Consumes: existing host feature route components and query invalidation helpers.
- Produces:
  - `HostDashboardRouteElement`
  - `HostMembersRouteElement`
  - `HostInvitationsRouteElement`
  - `HostNotificationsRouteElement`
  - `HostSessionClosingRouteElement`
  - `NewHostSessionRouteElement`
  - `EditHostSessionRouteElement`
  - shared `useSessionRecordsChangedInvalidation()`

- [ ] **Step 1: Add route-order assertions for host detail paths**

Modify `front/src/app/router-route-order.test.tsx` by adding this test inside the existing `describe` block:

```ts
  it("matches host session editor and closing routes before the member wildcard", () => {
    expect(routeIdsFor("/clubs/reading-sai/app/host/sessions/new")).toContain("club-app-host");
    expect(routeIdsFor("/clubs/reading-sai/app/host/sessions/session-1/edit")).toContain("club-app-host");
    expect(routeIdsFor("/clubs/reading-sai/app/host/sessions/session-1/closing")).toContain("club-app-host");
    expect(routePathsFor("/clubs/reading-sai/app/host/sessions/session-1/edit")).not.toEqual(
      expect.arrayContaining(["*"]),
    );
  });
```

- [ ] **Step 2: Run the route-order test before refactor**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- router-route-order
```

Expected: PASS. This proves the existing route behavior before the chunk split.

- [ ] **Step 3: Create shared invalidation hook**

Create `front/src/app/host-route-invalidation.ts` with this content:

```ts
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateArchiveQueries } from "@/features/archive/queries/archive-queries";
import { invalidateCurrentSession } from "@/features/current-session/queries/current-session-queries";
import { invalidateFeedbackQueries } from "@/features/feedback/queries/feedback-queries";
import type { HostSessionRecordsChangedEvent } from "@/features/host/route/host-session-editor-route";
import { invalidatePublicClubQueries } from "@/features/public/queries/public-queries";

export function useSessionRecordsChangedInvalidation() {
  const queryClient = useQueryClient();

  return useCallback(
    async ({ clubSlug }: HostSessionRecordsChangedEvent) => {
      const context = { clubSlug };
      await Promise.all([
        invalidateCurrentSession(queryClient, context),
        invalidateArchiveQueries(queryClient, context),
        invalidateFeedbackQueries(queryClient, context),
        invalidatePublicClubQueries(queryClient, clubSlug),
      ]);
    },
    [queryClient],
  );
}
```

- [ ] **Step 4: Create host route entry modules**

Create `front/src/app/host-routes/dashboard-route-element.tsx`:

```tsx
import { HostDashboardRoute } from "@/features/host/route/host-dashboard-route";
import { useAuth } from "@/src/app/auth-state";
import { hostDashboardReturnTarget, readmatesReturnState } from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";

export function HostDashboardRouteElement() {
  const authState = useAuth();

  return (
    <HostDashboardRoute
      auth={authState.status === "ready" ? authState.auth : undefined}
      LinkComponent={Link}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}
```

Create `front/src/app/host-routes/members-route-element.tsx`:

```tsx
import { HostMembersRoute } from "@/features/host/route/host-members-route";
import { Link } from "@/src/app/router-link";

export function HostMembersRouteElement() {
  return <HostMembersRoute LinkComponent={Link} />;
}
```

Create `front/src/app/host-routes/invitations-route-element.tsx`:

```tsx
import { HostInvitationsRoute } from "@/features/host/route/host-invitations-route";

export function HostInvitationsRouteElement() {
  return <HostInvitationsRoute />;
}
```

Create `front/src/app/host-routes/notifications-route-element.tsx`:

```tsx
import { HostNotificationsRoute } from "@/features/host/route/host-notifications-route";

export function HostNotificationsRouteElement() {
  return <HostNotificationsRoute />;
}
```

Create `front/src/app/host-routes/session-closing-route-element.tsx`:

```tsx
import { HostSessionClosingRoute } from "@/features/host/route/host-session-closing-route";

export function HostSessionClosingRouteElement() {
  return <HostSessionClosingRoute />;
}
```

Create `front/src/app/host-routes/new-session-route-element.tsx`:

```tsx
import { useLocation } from "react-router-dom";
import { NewHostSessionRoute } from "@/features/host/route/host-session-editor-route";
import { useSessionRecordsChangedInvalidation } from "@/src/app/host-route-invalidation";
import { hostDashboardReturnTarget, readmatesReturnState, readReadmatesReturnTarget } from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";

export function NewHostSessionRouteElement() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);
  const onSessionRecordsChanged = useSessionRecordsChangedInvalidation();

  return (
    <NewHostSessionRoute
      returnTarget={returnTarget}
      LinkComponent={Link}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
      onSessionRecordsChanged={onSessionRecordsChanged}
    />
  );
}
```

Create `front/src/app/host-routes/edit-session-route-element.tsx`:

```tsx
import { useLocation } from "react-router-dom";
import { EditHostSessionRoute } from "@/features/host/route/host-session-editor-route";
import { useSessionRecordsChangedInvalidation } from "@/src/app/host-route-invalidation";
import { hostDashboardReturnTarget, readmatesReturnState, readReadmatesReturnTarget } from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";

export function EditHostSessionRouteElement() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);
  const onSessionRecordsChanged = useSessionRecordsChangedInvalidation();

  return (
    <EditHostSessionRoute
      returnTarget={returnTarget}
      LinkComponent={Link}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
      onSessionRecordsChanged={onSessionRecordsChanged}
    />
  );
}
```

- [ ] **Step 5: Rewrite host route lazy imports**

In `front/src/app/routes/host.tsx`, replace each `import("@/src/app/host-route-elements")` call with the route-specific module.

For dashboard:

```ts
const [{ HostDashboardRouteElement }, { hostDashboardLoaderFactory }] = await Promise.all([
  import("@/src/app/host-routes/dashboard-route-element"),
  import("@/features/host/route/host-dashboard-data"),
]);
```

For members:

```ts
const [{ HostMembersRouteElement }, { hostMembersLoaderFactory }] = await Promise.all([
  import("@/src/app/host-routes/members-route-element"),
  import("@/features/host/route/host-members-data"),
]);
```

For invitations:

```ts
const [{ HostInvitationsRouteElement }, { hostInvitationsLoaderFactory }] = await Promise.all([
  import("@/src/app/host-routes/invitations-route-element"),
  import("@/features/host/route/host-invitations-data"),
]);
```

For notifications:

```ts
const [{ HostNotificationsRouteElement }, { hostNotificationsLoaderFactory }] = await Promise.all([
  import("@/src/app/host-routes/notifications-route-element"),
  import("@/features/host/route/host-notifications-data"),
]);
```

For new session:

```ts
const { NewHostSessionRouteElement } = await import("@/src/app/host-routes/new-session-route-element");
return { Component: NewHostSessionRouteElement };
```

For session closing:

```ts
const [{ HostSessionClosingRouteElement }, { hostSessionClosingLoaderFactory }] = await Promise.all([
  import("@/src/app/host-routes/session-closing-route-element"),
  import("@/features/host/route/host-session-closing-data"),
]);
```

For edit session:

```ts
const [{ EditHostSessionRouteElement }, { hostSessionEditorLoaderFactory }] = await Promise.all([
  import("@/src/app/host-routes/edit-session-route-element"),
  import("@/features/host/route/host-session-editor-data"),
]);
```

- [ ] **Step 6: Delete the old aggregate module**

Delete:

```bash
git rm front/src/app/host-route-elements.tsx
```

- [ ] **Step 7: Run route and frontend checks**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test -- router-route-order
npx --yes pnpm@10.33.0 --dir front build
npx --yes pnpm@10.33.0 --dir front build:budget
```

Expected: route-order test passes. Build passes. `build:budget` passes for hard-gated JS chunks after vendor and host split. CSS may remain a warning, not a hard failure.

- [ ] **Step 8: Run targeted host E2E checks**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front test:e2e -- tests/e2e/session-closing-flywheel.spec.ts tests/e2e/manual-notifications.spec.ts tests/e2e/host-club-operations.spec.ts
```

Expected: PASS. If local E2E services are unavailable, run the relevant unit tests and record the exact skipped E2E reason in the closeout task.

- [ ] **Step 9: Commit Task 3**

```bash
git add front/src/app/routes/host.tsx front/src/app/router-route-order.test.tsx front/src/app/host-route-invalidation.ts front/src/app/host-routes
git add -u front/src/app/host-route-elements.tsx
git commit -m "perf(front): split host route entry chunks"
```

---

### Task 4: Preview Lighthouse Command

**Files:**
- Create: `front/tests/performance/lighthouse-preview.ts`
- Create: `front/tests/performance/lighthouse-preview.test.ts`
- Create: `front/scripts/lighthouse-preview.ts`
- Modify: `front/scripts/lighthouse-diagnostic.ts`
- Modify: `front/tests/lighthouse/report-writer.test.ts`
- Modify: `front/package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `front/scripts/lighthouse-diagnostic.ts` and `front/tests/lighthouse/report-writer.ts`.
- Produces:
  - CLI: `npx --yes pnpm@10.33.0 --dir front lighthouse:preview`
  - Output: `.tmp/performance/lighthouse-preview/<timestamp>/summary.md`

- [ ] **Step 1: Write preview helper tests**

Create `front/tests/performance/lighthouse-preview.test.ts` with this content:

```ts
import { describe, expect, it } from "vitest";
import { buildPreviewCommand, previewOutputDir } from "./lighthouse-preview";

describe("lighthouse preview helpers", () => {
  it("creates a stable output directory under tmp performance", () => {
    expect(previewOutputDir("2026-06-28T00-00-00-000Z")).toBe(
      "../.tmp/performance/lighthouse-preview/2026-06-28T00-00-00-000Z",
    );
  });

  it("builds the existing diagnostic command with preview env", () => {
    const command = buildPreviewCommand({
      baseUrl: "http://127.0.0.1:4173",
      outputDir: "../.tmp/performance/lighthouse-preview/run",
      group: "public",
      limit: 2,
    });

    expect(command).toEqual({
      command: "tsx",
      args: ["scripts/lighthouse-diagnostic.ts", "--group", "public", "--limit", "2"],
      env: {
        LIGHTHOUSE_BASE_URL: "http://127.0.0.1:4173",
        LIGHTHOUSE_OUTPUT_DIR: "../.tmp/performance/lighthouse-preview/run",
        LIGHTHOUSE_SERVER_PROFILE: "vite-preview",
      },
    });
  });
});
```

- [ ] **Step 2: Run failing preview helper tests**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front exec vitest run tests/performance/lighthouse-preview.test.ts
```

Expected: FAIL because `front/tests/performance/lighthouse-preview.ts` does not exist.

- [ ] **Step 3: Implement preview helper**

Create `front/tests/performance/lighthouse-preview.ts` with this content:

```ts
import type { LighthouseRouteGroup } from "../lighthouse/types";

export type PreviewCommandInput = {
  baseUrl: string;
  outputDir: string;
  group?: LighthouseRouteGroup;
  limit?: number;
};

export type PreviewCommand = {
  command: "tsx";
  args: string[];
  env: Record<string, string>;
};

export function previewOutputDir(timestampSlug: string): string {
  return `../.tmp/performance/lighthouse-preview/${timestampSlug}`;
}

export function buildPreviewCommand(input: PreviewCommandInput): PreviewCommand {
  const args = ["scripts/lighthouse-diagnostic.ts"];
  if (input.group) {
    args.push("--group", input.group);
  }
  if (input.limit !== undefined) {
    args.push("--limit", String(input.limit));
  }

  return {
    command: "tsx",
    args,
    env: {
      LIGHTHOUSE_BASE_URL: input.baseUrl,
      LIGHTHOUSE_OUTPUT_DIR: input.outputDir,
      LIGHTHOUSE_SERVER_PROFILE: "vite-preview",
    },
  };
}
```

- [ ] **Step 4: Make Lighthouse diagnostic accept output/profile env overrides**

In `front/scripts/lighthouse-diagnostic.ts`, replace the `outputDir` and `serverProfile` assignments in `parseCliOptions()` and report writing.

Change `outputDir` line to:

```ts
outputDir:
  stringArg("--output") ??
  process.env.LIGHTHOUSE_OUTPUT_DIR ??
  resolve(process.cwd(), "..", ".tmp", "lighthouse", timestampSlug()),
```

Change report `serverProfile` to:

```ts
serverProfile: process.env.LIGHTHOUSE_SERVER_PROFILE ?? "local-dev",
```

- [ ] **Step 5: Extend report writer test for preview profile**

In `front/tests/lighthouse/report-writer.test.ts`, add:

```ts
  it("records preview server profile distinctly from local dev diagnostics", async () => {
    await writeLighthouseDiagnosticReport({
      outputDir,
      runContext: {
        commit: "abc123",
        timestamp: "2026-06-28T00:00:00.000Z",
        deviceProfile: "desktop-chromium",
        serverProfile: "vite-preview",
      },
      results: [result],
    });

    const summary = await readFile(join(outputDir, "summary.md"), "utf8");
    expect(summary).toContain("- server profile: vite-preview");
  });
```

- [ ] **Step 6: Add the preview CLI**

Create `front/scripts/lighthouse-preview.ts` with this content:

```ts
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { buildPreviewCommand, previewOutputDir } from "../tests/performance/lighthouse-preview";
import type { LighthouseRouteGroup } from "../tests/lighthouse/types";

function stringArg(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function parseGroup(value: string | undefined): LighthouseRouteGroup | undefined {
  if (value === undefined) return undefined;
  if (value === "public" || value === "member" || value === "host" || value === "admin") return value;
  throw new Error(`Unsupported --group value: ${value}`);
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--limit must be a positive integer, received ${value}`);
  }
  return parsed;
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function findFreePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolvePort(address.port);
        else reject(new Error("Unable to allocate preview port"));
      });
    });
  });
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function waitForPreview(baseUrl: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Vite preview did not become ready at ${baseUrl}`);
}

async function run() {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const outputDir = previewOutputDir(timestampSlug());

  await runCommand("pnpm", ["build"]);

  const preview = spawn("pnpm", ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    stdio: "inherit",
    env: process.env,
  });

  try {
    await waitForPreview(baseUrl);
    const command = buildPreviewCommand({
      baseUrl,
      outputDir,
      group: parseGroup(stringArg("--group")),
      limit: parseLimit(stringArg("--limit")),
    });
    await runCommand(command.command, command.args, command.env);
  } finally {
    preview.kill("SIGTERM");
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 7: Add package scripts**

Modify `front/package.json` scripts by adding:

```json
"lighthouse:preview": "tsx scripts/lighthouse-preview.ts"
```

Modify root `package.json` scripts by adding:

```json
"front:lighthouse:preview": "pnpm --dir front lighthouse:preview"
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front exec vitest run tests/performance/lighthouse-preview.test.ts tests/lighthouse/report-writer.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run preview Lighthouse smoke**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front lighthouse:preview -- --group public --limit 2
```

Expected: command builds, starts Vite preview, writes `.tmp/performance/lighthouse-preview/<timestamp>/summary.md`, and exits 0. If local browser dependencies are unavailable, record the exact failure and keep the unit-tested preview command; do not claim preview Lighthouse passed.

- [ ] **Step 10: Commit Task 4**

```bash
git add front/tests/performance/lighthouse-preview.ts front/tests/performance/lighthouse-preview.test.ts front/scripts/lighthouse-preview.ts front/scripts/lighthouse-diagnostic.ts front/tests/lighthouse/report-writer.test.ts front/package.json package.json
git commit -m "test(front): add preview lighthouse performance path"
```

---

### Task 5: Documentation, Release Readiness, And Final Verification

**Files:**
- Create: `docs/development/performance-budget.md`
- Modify: `docs/development/release-readiness-review.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1-4 commands and generated evidence.
- Produces: contributor documentation and release-readiness closeout note.

- [ ] **Step 1: Write performance budget documentation**

Create `docs/development/performance-budget.md` with this content:

````markdown
# Frontend Performance Budget

ReadMates tracks production-build asset size as local release-readiness evidence. The budget is a frontend build-quality gate; it is not a production smoke replacement.

## Commands

Run the production build and budget report:

```bash
npx --yes pnpm@10.33.0 --dir front build
npx --yes pnpm@10.33.0 --dir front build:budget
```

Run the combined alias:

```bash
npx --yes pnpm@10.33.0 --dir front performance:budget
```

Run Lighthouse against production build output through Vite preview:

```bash
npx --yes pnpm@10.33.0 --dir front lighthouse:preview -- --group public --limit 2
```

## Artifacts

Build budget output is written under:

```text
.tmp/performance/build-budget.json
.tmp/performance/build-budget.md
```

Preview Lighthouse output is written under:

```text
.tmp/performance/lighthouse-preview/<timestamp>/
```

These files are local evidence only and should not be committed.

## Budget Meaning

Hard-gated JavaScript buckets fail the command when a chunk exceeds its limit. The first implementation gates split vendor chunks, host route chunks, app entry, and ordinary route chunks according to the source-controlled budget config.

Global CSS is measured but not hard-failed in this iteration. A future CSS boundary design should decide whether to split page-level styles before turning CSS size into a hard gate.

## Release Evidence Boundary

Passing local performance budget evidence means production build assets stayed within the repo-defined size budget. It does not prove production OAuth, VM health, provider-console state, release tag workflows, OCI compose promotion, or post-deploy smoke.
````

- [ ] **Step 2: Update CHANGELOG**

Under `CHANGELOG.md` `## Unreleased` -> `### Testing`, add:

```markdown
- **frontend performance budget:** Production build asset sizes are now reported as local JSON/Markdown evidence, with split vendor and host-route chunks tracked against explicit budgets. Preview-based Lighthouse diagnostics can run against Vite production build output, while global CSS size remains measured-only pending a dedicated CSS boundary design. Runtime routes, server API contracts, DB migrations, auth/BFF tokens, OAuth scopes, and deploy workflow behavior are unchanged.
```

- [ ] **Step 3: Add release-readiness closeout note**

After Step 4 verification finishes, add a dated section near the top of `docs/development/release-readiness-review.md`, below the title and intro. Use this exact structure, replacing the command evidence bullets with the commands that were actually run in Step 4 and their actual result:

```markdown
## 2026-06-28 Frontend performance budget and bundle diet closeout

- Scope reviewed: local frontend build tooling, Vite chunk grouping, host route entry splitting, preview Lighthouse diagnostic path, and docs.
- Release classification: frontend build/test tooling plus route-entry chunk refactor. No server API contract, DB migration, auth/BFF token, OAuth scope, Cloudflare Pages Functions behavior, release image behavior, or deploy workflow behavior changed.
- Product evidence: production build assets are reported under `.tmp/performance/build-budget.*`; split vendor and host route chunks stay within hard-gated JS budgets; global CSS remains measured-only.
- Lighthouse evidence: preview mode runs against Vite production build output and records `server profile: vite-preview`, separating route entry failures from Lighthouse findings.
- Public safety: generated `.tmp/performance/` artifacts are ignored/local-only and public release candidate checks passed without adding build, Lighthouse, screenshot, secret, private-domain, local-path, OCID, deployment-state, or token-shaped artifacts.
- Local verification before merge: list each verification command from Step 4 with `pass`, `fail`, or `skipped`, including the exact skipped reason when applicable.
- Skipped before merge: production OAuth, VM, provider-console, release tag workflow, OCI compose promotion, GitHub Release publication, and post-deploy smoke. These require release-operation access after merge and are not local evidence for this frontend tooling branch.
- Residual risk: state whether the Vite 350 kB warning is gone. If it remains, name the exact chunk and the follow-up needed to close it.
```

Do not write this section before Step 4 has produced real evidence. The committed note must contain actual command results, not inferred pass/fail claims.

- [ ] **Step 4: Run final verification**

Run:

```bash
npx --yes pnpm@10.33.0 --dir front lint
npx --yes pnpm@10.33.0 --dir front test
npx --yes pnpm@10.33.0 --dir front build
npx --yes pnpm@10.33.0 --dir front build:budget
npx --yes pnpm@10.33.0 --dir front exec vitest run tests/performance tests/lighthouse/report-writer.test.ts
```

Run targeted host E2E if Task 3 changed host route entry modules:

```bash
npx --yes pnpm@10.33.0 --dir front test:e2e -- tests/e2e/session-closing-flywheel.spec.ts tests/e2e/manual-notifications.spec.ts tests/e2e/host-club-operations.spec.ts
```

Run preview Lighthouse smoke:

```bash
npx --yes pnpm@10.33.0 --dir front lighthouse:preview -- --group public --limit 2
```

Run docs and public release checks:

```bash
git diff --check -- CHANGELOG.md docs/development/performance-budget.md docs/development/release-readiness-review.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: All commands pass. If a command cannot run because of local browser, Docker, or service dependency, record the exact command and reason in `docs/development/release-readiness-review.md` and in the final response.

- [ ] **Step 5: Commit Task 5**

```bash
git add CHANGELOG.md docs/development/performance-budget.md docs/development/release-readiness-review.md
git commit -m "docs: document frontend performance budget evidence"
```

---

## Final Closeout Checklist

- [ ] Run `git status --short` and confirm only intended generated ignored artifacts remain.
- [ ] Run `git log --oneline -5` and confirm task commits are ordered and scoped.
- [ ] Confirm `.tmp/performance/` is not staged.
- [ ] Confirm `front/dist/` is not staged.
- [ ] Confirm `front/__screenshots__` was not modified by this work unless an intentional visual baseline update was separately reviewed.
- [ ] Confirm final response names changed surface, checks actually run, skipped validation with reasons, remaining risk, and whether the Vite 350 kB warning is gone.

## Plan Self-review

- Spec coverage: Task 1 covers build budget collection and reports; Task 2 covers vendor chunking; Task 3 covers host route entry chunk reduction; Task 4 covers preview Lighthouse evidence; Task 5 covers docs, release-readiness, public safety, and verification.
- Completeness scan: no incomplete file paths or evidence fields remain. Task 5 requires actual command results before the release-readiness note is committed.
- Type consistency: `BuildAssetInput`, `BudgetRule`, `BuildBudgetReport`, `analyzeBuildAssets`, `renderBuildBudgetMarkdown`, `previewOutputDir`, and `buildPreviewCommand` are introduced before later tasks consume them.
- Scope check: this remains one frontend/docs/tooling implementation plan with no server, DB, BFF, OAuth, or deploy behavior changes.
