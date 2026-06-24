# ReadMates Lighthouse Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Lighthouse diagnostic harness that audits ReadMates public, member, host, and platform-admin dev-seed routes and writes non-gating reports under `.tmp/lighthouse/`.

**Architecture:** Keep the diagnostic isolated under frontend tooling. Route inventory is explicit typed data, Lighthouse findings are normalized into ReadMates cause buckets, report writing is pure filesystem output, and the CLI orchestrates Playwright-controlled auth plus Lighthouse audits without changing product code.

**Tech Stack:** Vite React frontend, TypeScript, Vitest, Playwright, Google Lighthouse Node API, pnpm workspace scripts.

## Global Constraints

- Follow `docs/agents/front.md` for all `front/` changes.
- Follow `docs/agents/docs.md` for package script and plan updates.
- Do not add production server code, DB migrations, or BFF contract changes.
- Do not change product UI as part of the diagnostic tool implementation.
- Do not run real OAuth, email, notification delivery, or external provider flows.
- Do not introduce score thresholds as blocking CI gates in the first version.
- Do not publish Lighthouse reports, local paths, deployment state, private domains, secrets, or real member data.
- Write generated artifacts only under `.tmp/lighthouse/`.
- Desktop Chromium is the only required device profile in this implementation.

---

## File Structure

- Create `front/tests/lighthouse/types.ts`: shared diagnostic types and cause bucket unions.
- Create `front/tests/lighthouse/route-inventory.ts`: explicit route inventory and seed constants.
- Create `front/tests/lighthouse/route-inventory.test.ts`: inventory completeness and uniqueness tests.
- Create `front/tests/lighthouse/finding-classifier.ts`: Lighthouse audit ID to ReadMates cause bucket mapping and score extraction helpers.
- Create `front/tests/lighthouse/finding-classifier.test.ts`: classifier unit tests.
- Create `front/tests/lighthouse/report-writer.ts`: write `summary.md`, `routes.json`, `findings.json`, raw JSON, and HTML report files.
- Create `front/tests/lighthouse/report-writer.test.ts`: filesystem output tests using a temporary directory.
- Create `front/tests/lighthouse/lighthouse-runner.ts`: Playwright browser/session control, route entry checks, and Lighthouse adapter boundary.
- Create `front/tests/lighthouse/lighthouse-runner.test.ts`: runner tests using mocked browser and Lighthouse adapter behavior.
- Create `front/scripts/lighthouse-diagnostic.ts`: CLI argument parsing and orchestration.
- Modify `front/package.json`: add `lighthouse`, add `lighthouse:diagnose`.
- Modify root `package.json`: add optional `front:lighthouse` alias.
- Modify `docs/development/test-guide.md`: add a short local diagnostic command note.

---

### Task 1: Route Inventory And Shared Types

**Files:**
- Create: `front/tests/lighthouse/types.ts`
- Create: `front/tests/lighthouse/route-inventory.ts`
- Create: `front/tests/lighthouse/route-inventory.test.ts`

**Interfaces:**
- Produces: `LIGHTHOUSE_ROUTE_INVENTORY: LighthouseRouteDefinition[]`
- Produces: `filterRoutes(routes, filters): LighthouseRouteDefinition[]`
- Produces: `READING_SAI_FIXTURES`
- Consumes: no previous task output

- [ ] **Step 1: Write the failing inventory tests**

Create `front/tests/lighthouse/route-inventory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  LIGHTHOUSE_ROUTE_INVENTORY,
  READING_SAI_FIXTURES,
  filterRoutes,
} from "./route-inventory";

describe("LIGHTHOUSE_ROUTE_INVENTORY", () => {
  it("keeps route ids unique", () => {
    const ids = LIGHTHOUSE_ROUTE_INVENTORY.map((route) => route.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers public member host and admin groups", () => {
    expect(new Set(LIGHTHOUSE_ROUTE_INVENTORY.map((route) => route.group))).toEqual(
      new Set(["public", "member", "host", "admin"]),
    );
  });

  it("uses stable dev-seed constants for seeded paths", () => {
    expect(READING_SAI_FIXTURES.clubId).toBe("00000000-0000-0000-0000-000000000001");
    expect(READING_SAI_FIXTURES.slug).toBe("reading-sai");
    expect(READING_SAI_FIXTURES.publicSessionId).toBe("00000000-0000-0000-0000-000000000301");
    expect(READING_SAI_FIXTURES.memberSessionId).toBe("00000000-0000-0000-0000-000000000301");
  });

  it("marks authenticated routes with the matching auth account", () => {
    const memberRoutes = LIGHTHOUSE_ROUTE_INVENTORY.filter((route) => route.group === "member");
    const hostRoutes = LIGHTHOUSE_ROUTE_INVENTORY.filter((route) => route.group === "host");
    const adminRoutes = LIGHTHOUSE_ROUTE_INVENTORY.filter((route) => route.group === "admin");

    expect(memberRoutes.every((route) => route.auth === "member")).toBe(true);
    expect(hostRoutes.every((route) => route.auth === "host")).toBe(true);
    expect(adminRoutes.every((route) => route.auth === "admin")).toBe(true);
  });

  it("filters by group route id and limit", () => {
    const filtered = filterRoutes(LIGHTHOUSE_ROUTE_INVENTORY, {
      group: "public",
      routeId: undefined,
      limit: 2,
    });

    expect(filtered).toHaveLength(2);
    expect(filtered.every((route) => route.group === "public")).toBe(true);

    const oneRoute = filterRoutes(LIGHTHOUSE_ROUTE_INVENTORY, {
      group: undefined,
      routeId: "admin-today",
      limit: undefined,
    });

    expect(oneRoute.map((route) => route.id)).toEqual(["admin-today"]);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --dir front exec vitest run tests/lighthouse/route-inventory.test.ts
```

Expected: FAIL because `front/tests/lighthouse/route-inventory.ts` does not exist.

- [ ] **Step 3: Add shared types**

Create `front/tests/lighthouse/types.ts`:

```ts
export type LighthouseRouteGroup = "public" | "member" | "host" | "admin";
export type LighthouseRouteMode = "navigation" | "snapshot" | "timespan";
export type LighthouseRouteAuth = "none" | "member" | "host" | "admin";

export type LighthouseCauseBucket =
  | "bundle_js_cost"
  | "image_media"
  | "layout_stability"
  | "accessibility"
  | "seo_public_metadata"
  | "security_best_practices"
  | "route_data_failure"
  | "external_asset_noise"
  | "audit_failure";

export type LighthouseRouteDefinition = {
  id: string;
  group: LighthouseRouteGroup;
  path: string;
  mode: LighthouseRouteMode;
  auth: LighthouseRouteAuth;
  description: string;
  expectedText?: string;
  notes?: string;
};

export type LighthouseRouteFilters = {
  group?: LighthouseRouteGroup;
  routeId?: string;
  limit?: number;
};
```

- [ ] **Step 4: Add route inventory**

Create `front/tests/lighthouse/route-inventory.ts`:

```ts
import type {
  LighthouseRouteDefinition,
  LighthouseRouteFilters,
} from "./types";

export const READING_SAI_FIXTURES = {
  clubId: "00000000-0000-0000-0000-000000000001",
  slug: "reading-sai",
  publicSessionId: "00000000-0000-0000-0000-000000000301",
  memberSessionId: "00000000-0000-0000-0000-000000000301",
} as const;

const scopedClubPath = `/clubs/${READING_SAI_FIXTURES.slug}`;
const publicSessionPath = `${scopedClubPath}/sessions/${READING_SAI_FIXTURES.publicSessionId}`;
const memberSessionPath = `${scopedClubPath}/app/sessions/${READING_SAI_FIXTURES.memberSessionId}`;
const feedbackPath = `${scopedClubPath}/app/feedback/${READING_SAI_FIXTURES.memberSessionId}`;
const hostSessionPath = `${scopedClubPath}/app/host/sessions/${READING_SAI_FIXTURES.memberSessionId}`;

export const LIGHTHOUSE_ROUTE_INVENTORY: LighthouseRouteDefinition[] = [
  { id: "public-home", group: "public", path: "/", mode: "navigation", auth: "none", description: "Unscoped public home", expectedText: "읽는사이" },
  { id: "public-about", group: "public", path: "/about", mode: "navigation", auth: "none", description: "Unscoped public about", expectedText: "읽는사이" },
  { id: "public-records", group: "public", path: "/records", mode: "navigation", auth: "none", description: "Unscoped public records", expectedText: "공개 기록" },
  { id: "public-session", group: "public", path: `/sessions/${READING_SAI_FIXTURES.publicSessionId}`, mode: "navigation", auth: "none", description: "Unscoped public session detail", expectedText: "팩트풀니스" },
  { id: "club-home", group: "public", path: scopedClubPath, mode: "navigation", auth: "none", description: "Scoped public club home", expectedText: "읽는사이" },
  { id: "club-about", group: "public", path: `${scopedClubPath}/about`, mode: "navigation", auth: "none", description: "Scoped public club about", expectedText: "읽는사이" },
  { id: "club-records", group: "public", path: `${scopedClubPath}/records`, mode: "navigation", auth: "none", description: "Scoped public records", expectedText: "공개 기록" },
  { id: "club-session", group: "public", path: publicSessionPath, mode: "navigation", auth: "none", description: "Scoped public session detail", expectedText: "팩트풀니스" },
  { id: "login", group: "public", path: "/login", mode: "navigation", auth: "none", description: "Login entry page", expectedText: "Google" },
  { id: "reset-password-retired", group: "public", path: "/reset-password/sample-token", mode: "navigation", auth: "none", description: "Retired password reset route", expectedText: "Google" },
  { id: "public-not-found", group: "public", path: "/missing-lighthouse-diagnostic-route", mode: "navigation", auth: "none", description: "Public route error page", expectedText: "찾을 수" },
  { id: "member-home", group: "member", path: `${scopedClubPath}/app`, mode: "snapshot", auth: "member", description: "Member home", expectedText: "멤버" },
  { id: "member-current-session", group: "member", path: `${scopedClubPath}/app/session/current`, mode: "timespan", auth: "member", description: "Current session route", expectedText: "세션" },
  { id: "member-notes", group: "member", path: `${scopedClubPath}/app/notes`, mode: "snapshot", auth: "member", description: "Member notes feed", expectedText: "노트" },
  { id: "member-archive", group: "member", path: `${scopedClubPath}/app/archive`, mode: "snapshot", auth: "member", description: "Member archive", expectedText: "아카이브" },
  { id: "member-me", group: "member", path: `${scopedClubPath}/app/me`, mode: "snapshot", auth: "member", description: "Member profile page", expectedText: "내" },
  { id: "member-notifications", group: "member", path: `${scopedClubPath}/app/notifications`, mode: "snapshot", auth: "member", description: "Member notification inbox", expectedText: "알림" },
  { id: "member-session-detail", group: "member", path: memberSessionPath, mode: "snapshot", auth: "member", description: "Member session detail", expectedText: "팩트풀니스" },
  { id: "member-feedback", group: "member", path: feedbackPath, mode: "snapshot", auth: "member", description: "Member feedback document", expectedText: "피드백" },
  { id: "member-feedback-print", group: "member", path: `${feedbackPath}/print`, mode: "snapshot", auth: "member", description: "Feedback print document", expectedText: "피드백" },
  { id: "host-dashboard", group: "host", path: `${scopedClubPath}/app/host`, mode: "timespan", auth: "host", description: "Host dashboard", expectedText: "운영" },
  { id: "host-members", group: "host", path: `${scopedClubPath}/app/host/members`, mode: "snapshot", auth: "host", description: "Host members ledger", expectedText: "멤버" },
  { id: "host-invitations", group: "host", path: `${scopedClubPath}/app/host/invitations`, mode: "snapshot", auth: "host", description: "Host invitations ledger", expectedText: "초대" },
  { id: "host-notifications", group: "host", path: `${scopedClubPath}/app/host/notifications`, mode: "snapshot", auth: "host", description: "Host notifications ledger", expectedText: "알림" },
  { id: "host-new-session", group: "host", path: `${scopedClubPath}/app/host/sessions/new`, mode: "snapshot", auth: "host", description: "Host session editor create route", expectedText: "세션" },
  { id: "host-edit-session", group: "host", path: `${hostSessionPath}/edit`, mode: "snapshot", auth: "host", description: "Host session editor detail route", expectedText: "팩트풀니스" },
  { id: "host-session-closing", group: "host", path: `${hostSessionPath}/closing`, mode: "snapshot", auth: "host", description: "Host closing board", expectedText: "클로징" },
  { id: "admin-today", group: "admin", path: "/admin/today", mode: "timespan", auth: "admin", description: "Platform admin today ledger", expectedText: "오늘" },
  { id: "admin-health", group: "admin", path: "/admin/health", mode: "snapshot", auth: "admin", description: "Platform admin health", expectedText: "헬스" },
  { id: "admin-clubs", group: "admin", path: "/admin/clubs", mode: "snapshot", auth: "admin", description: "Platform admin clubs", expectedText: "클럽" },
  { id: "admin-support", group: "admin", path: "/admin/support", mode: "snapshot", auth: "admin", description: "Platform admin support", expectedText: "지원" },
  { id: "admin-notifications", group: "admin", path: "/admin/notifications", mode: "snapshot", auth: "admin", description: "Platform admin notifications", expectedText: "알림" },
  { id: "admin-ai-ops", group: "admin", path: "/admin/ai-ops", mode: "snapshot", auth: "admin", description: "Platform admin AI operations", expectedText: "AI" },
  { id: "admin-audit", group: "admin", path: "/admin/audit", mode: "snapshot", auth: "admin", description: "Platform admin audit", expectedText: "감사" },
  { id: "admin-analytics", group: "admin", path: "/admin/analytics", mode: "snapshot", auth: "admin", description: "Platform admin analytics", expectedText: "분석" },
  { id: "admin-club-detail", group: "admin", path: `/admin/clubs/${READING_SAI_FIXTURES.clubId}`, mode: "snapshot", auth: "admin", description: "Platform admin club detail", expectedText: "읽는사이" },
];

export function filterRoutes(
  routes: LighthouseRouteDefinition[],
  filters: LighthouseRouteFilters,
) {
  let filtered = routes;
  if (filters.group) {
    filtered = filtered.filter((route) => route.group === filters.group);
  }
  if (filters.routeId) {
    filtered = filtered.filter((route) => route.id === filters.routeId);
  }
  if (filters.limit !== undefined) {
    filtered = filtered.slice(0, filters.limit);
  }
  return filtered;
}
```

- [ ] **Step 5: Run the route inventory test**

Run:

```bash
pnpm --dir front exec vitest run tests/lighthouse/route-inventory.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add front/tests/lighthouse/types.ts front/tests/lighthouse/route-inventory.ts front/tests/lighthouse/route-inventory.test.ts
git commit -m "test(front): define lighthouse route inventory"
```

---

### Task 2: Finding Classification

**Files:**
- Create: `front/tests/lighthouse/finding-classifier.ts`
- Create: `front/tests/lighthouse/finding-classifier.test.ts`
- Modify: `front/tests/lighthouse/types.ts`

**Interfaces:**
- Consumes: `LighthouseCauseBucket` from `types.ts`
- Produces: `classifyAuditId(auditId: string): LighthouseCauseBucket`
- Produces: `summarizeLhr(route, lhr): NormalizedLighthouseResult`

- [ ] **Step 1: Extend shared types for normalized results**

Modify `front/tests/lighthouse/types.ts` by adding:

```ts
export type LighthouseCategoryScores = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
};

export type LighthouseFinding = {
  auditId: string;
  title: string;
  score: number | null;
  numericValue: number | null;
  bucket: LighthouseCauseBucket;
};

export type NormalizedLighthouseResult = {
  routeId: string;
  group: LighthouseRouteGroup;
  path: string;
  mode: LighthouseRouteMode;
  status: "passed" | "route_failure" | "audit_failure";
  scores: LighthouseCategoryScores;
  findings: LighthouseFinding[];
  reportJsonPath?: string;
  reportHtmlPath?: string;
  failureReason?: string;
};
```

- [ ] **Step 2: Write failing classifier tests**

Create `front/tests/lighthouse/finding-classifier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LighthouseRouteDefinition } from "./types";
import { classifyAuditId, summarizeLhr } from "./finding-classifier";

const route: LighthouseRouteDefinition = {
  id: "public-home",
  group: "public",
  path: "/",
  mode: "navigation",
  auth: "none",
  description: "Public home",
};

describe("classifyAuditId", () => {
  it.each([
    ["unused-javascript", "bundle_js_cost"],
    ["uses-responsive-images", "image_media"],
    ["cumulative-layout-shift", "layout_stability"],
    ["button-name", "accessibility"],
    ["meta-description", "seo_public_metadata"],
    ["errors-in-console", "security_best_practices"],
  ] as const)("maps %s to %s", (auditId, bucket) => {
    expect(classifyAuditId(auditId)).toBe(bucket);
  });
});

describe("summarizeLhr", () => {
  it("extracts category scores and failed audits", () => {
    const result = summarizeLhr(route, {
      categories: {
        performance: { score: 0.82 },
        accessibility: { score: 0.91 },
        "best-practices": { score: 1 },
        seo: { score: null },
      },
      audits: {
        "unused-javascript": {
          id: "unused-javascript",
          title: "Reduce unused JavaScript",
          score: 0,
          numericValue: 1234,
        },
        "document-title": {
          id: "document-title",
          title: "Document has a title",
          score: 1,
        },
      },
    });

    expect(result.scores).toEqual({
      performance: 0.82,
      accessibility: 0.91,
      bestPractices: 1,
      seo: null,
    });
    expect(result.findings).toEqual([
      {
        auditId: "unused-javascript",
        title: "Reduce unused JavaScript",
        score: 0,
        numericValue: 1234,
        bucket: "bundle_js_cost",
      },
    ]);
  });
});
```

- [ ] **Step 3: Run the failing classifier tests**

Run:

```bash
pnpm --dir front exec vitest run tests/lighthouse/finding-classifier.test.ts
```

Expected: FAIL because `front/tests/lighthouse/finding-classifier.ts` does not exist.

- [ ] **Step 4: Add classifier implementation**

Create `front/tests/lighthouse/finding-classifier.ts`:

```ts
import type {
  LighthouseCauseBucket,
  LighthouseRouteDefinition,
  NormalizedLighthouseResult,
} from "./types";

type RawLhrAudit = {
  id?: string;
  title?: string;
  score?: number | null;
  numericValue?: number | null;
};

type RawLhr = {
  categories?: Record<string, { score?: number | null } | undefined>;
  audits?: Record<string, RawLhrAudit | undefined>;
};

const auditBuckets: Record<string, LighthouseCauseBucket> = {
  "unused-javascript": "bundle_js_cost",
  "legacy-javascript": "bundle_js_cost",
  "bootup-time": "bundle_js_cost",
  "mainthread-work-breakdown": "bundle_js_cost",
  "uses-optimized-images": "image_media",
  "uses-responsive-images": "image_media",
  "offscreen-images": "image_media",
  "cumulative-layout-shift": "layout_stability",
  "layout-shifts": "layout_stability",
  "color-contrast": "accessibility",
  "button-name": "accessibility",
  "link-name": "accessibility",
  "aria-allowed-attr": "accessibility",
  "aria-required-attr": "accessibility",
  "heading-order": "accessibility",
  "document-title": "seo_public_metadata",
  "meta-description": "seo_public_metadata",
  canonical: "seo_public_metadata",
  crawlable-anchors: "seo_public_metadata",
  "errors-in-console": "security_best_practices",
  csp-xss: "security_best_practices",
  "deprecations": "security_best_practices",
};

export function classifyAuditId(auditId: string): LighthouseCauseBucket {
  return auditBuckets[auditId] ?? "security_best_practices";
}

function categoryScore(lhr: RawLhr, key: string) {
  return lhr.categories?.[key]?.score ?? null;
}

function isFailedAudit(audit: RawLhrAudit) {
  if (audit.score === null || audit.score === undefined) {
    return false;
  }
  return audit.score < 1;
}

export function summarizeLhr(
  route: LighthouseRouteDefinition,
  lhr: RawLhr,
): NormalizedLighthouseResult {
  const findings = Object.entries(lhr.audits ?? {})
    .filter((entry): entry is [string, RawLhrAudit] => Boolean(entry[1]))
    .filter(([, audit]) => isFailedAudit(audit))
    .map(([auditId, audit]) => ({
      auditId,
      title: audit.title ?? auditId,
      score: audit.score ?? null,
      numericValue: audit.numericValue ?? null,
      bucket: classifyAuditId(auditId),
    }));

  return {
    routeId: route.id,
    group: route.group,
    path: route.path,
    mode: route.mode,
    status: "passed",
    scores: {
      performance: categoryScore(lhr, "performance"),
      accessibility: categoryScore(lhr, "accessibility"),
      bestPractices: categoryScore(lhr, "best-practices"),
      seo: categoryScore(lhr, "seo"),
    },
    findings,
  };
}
```

- [ ] **Step 5: Run classifier tests**

Run:

```bash
pnpm --dir front exec vitest run tests/lighthouse/finding-classifier.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add front/tests/lighthouse/types.ts front/tests/lighthouse/finding-classifier.ts front/tests/lighthouse/finding-classifier.test.ts
git commit -m "test(front): classify lighthouse findings"
```

---

### Task 3: Report Writer

**Files:**
- Create: `front/tests/lighthouse/report-writer.ts`
- Create: `front/tests/lighthouse/report-writer.test.ts`

**Interfaces:**
- Consumes: `NormalizedLighthouseResult`
- Produces: `writeLighthouseDiagnosticReport(input): Promise<ReportWriteResult>`

- [ ] **Step 1: Write failing report writer tests**

Create `front/tests/lighthouse/report-writer.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NormalizedLighthouseResult } from "./types";
import { writeLighthouseDiagnosticReport } from "./report-writer";

let outputDir = "";

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), "readmates-lighthouse-"));
});

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

const result: NormalizedLighthouseResult = {
  routeId: "public-home",
  group: "public",
  path: "/",
  mode: "navigation",
  status: "passed",
  scores: {
    performance: 0.82,
    accessibility: 0.91,
    bestPractices: 1,
    seo: 0.89,
  },
  findings: [
    {
      auditId: "unused-javascript",
      title: "Reduce unused JavaScript",
      score: 0,
      numericValue: 1234,
      bucket: "bundle_js_cost",
    },
  ],
  reportJsonPath: "results/public-home.json",
  reportHtmlPath: "reports/public-home.html",
};

describe("writeLighthouseDiagnosticReport", () => {
  it("writes summary routes and findings files", async () => {
    const written = await writeLighthouseDiagnosticReport({
      outputDir,
      runContext: {
        commit: "abc123",
        timestamp: "2026-06-25T00:00:00.000Z",
        deviceProfile: "desktop-chromium",
        serverProfile: "local-dev",
      },
      results: [result],
    });

    expect(written.summaryPath.endsWith("summary.md")).toBe(true);

    const summary = await readFile(join(outputDir, "summary.md"), "utf8");
    expect(summary).toContain("# ReadMates Lighthouse Diagnostic");
    expect(summary).toContain("| public | public-home | navigation | passed | 0.82 | 0.91 | 1.00 | 0.89 | unused-javascript |");
    expect(summary).toContain("bundle_js_cost");

    const routesJson = JSON.parse(await readFile(join(outputDir, "routes.json"), "utf8"));
    expect(routesJson).toEqual([{ routeId: "public-home", group: "public", path: "/", mode: "navigation", status: "passed" }]);

    const findingsJson = JSON.parse(await readFile(join(outputDir, "findings.json"), "utf8"));
    expect(findingsJson[0].findings[0].bucket).toBe("bundle_js_cost");
  });
});
```

- [ ] **Step 2: Run the failing report writer test**

Run:

```bash
pnpm --dir front exec vitest run tests/lighthouse/report-writer.test.ts
```

Expected: FAIL because `front/tests/lighthouse/report-writer.ts` does not exist.

- [ ] **Step 3: Add report writer implementation**

Create `front/tests/lighthouse/report-writer.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NormalizedLighthouseResult } from "./types";

export type LighthouseRunContext = {
  commit: string;
  timestamp: string;
  deviceProfile: string;
  serverProfile: string;
};

export type WriteReportInput = {
  outputDir: string;
  runContext: LighthouseRunContext;
  results: NormalizedLighthouseResult[];
};

export type ReportWriteResult = {
  summaryPath: string;
  routesPath: string;
  findingsPath: string;
};

function scoreText(score: number | null) {
  return score === null ? "n/a" : score.toFixed(2);
}

function routeMatrixRow(result: NormalizedLighthouseResult) {
  const keyFindings = result.findings.map((finding) => finding.auditId).join(", ") || "none";
  return [
    result.group,
    result.routeId,
    result.mode,
    result.status,
    scoreText(result.scores.performance),
    scoreText(result.scores.accessibility),
    scoreText(result.scores.bestPractices),
    scoreText(result.scores.seo),
    keyFindings,
  ].join(" | ");
}

function repeatedCauseRows(results: NormalizedLighthouseResult[]) {
  const byBucket = new Map<string, Set<string>>();
  for (const result of results) {
    for (const finding of result.findings) {
      const routes = byBucket.get(finding.bucket) ?? new Set<string>();
      routes.add(result.routeId);
      byBucket.set(finding.bucket, routes);
    }
  }

  return Array.from(byBucket.entries())
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([bucket, routes]) => `| ${bucket} | ${Array.from(routes).join(", ")} | Lighthouse audit findings | Create a scoped goal from affected routes |`);
}

function buildSummary(input: WriteReportInput) {
  const failedRoutes = input.results.filter((result) => result.status !== "passed");
  const matrixRows = input.results.map((result) => `| ${routeMatrixRow(result)} |`);
  const causeRows = repeatedCauseRows(input.results);

  const baseLines = [
    "# ReadMates Lighthouse Diagnostic",
    "",
    "## Run Context",
    `- commit: ${input.runContext.commit}`,
    `- timestamp: ${input.runContext.timestamp}`,
    `- device profile: ${input.runContext.deviceProfile}`,
    `- server profile: ${input.runContext.serverProfile}`,
    `- route count: ${input.results.length}`,
    `- failed route count: ${failedRoutes.length}`,
    "",
    "## Executive Summary",
    `- Route entry failures: ${failedRoutes.map((result) => result.routeId).join(", ") || "none"}`,
    "- Suggested next improvement goals: inspect repeated cause rows and choose the smallest affected surface.",
    "",
    "## Route Matrix",
    "| group | route | mode | status | performance | accessibility | best-practices | seo | key findings |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const causeLines = causeRows.length ? causeRows : ["| none | none | no failed Lighthouse audits | keep baseline |"];
  return baseLines.concat(
    matrixRows,
    [
      "",
    "## Repeated Root Causes",
    "| cause | affected routes | evidence | safe improvement direction |",
    "| --- | --- | --- | --- |",
    ],
    causeLines,
    [
      "",
    "",
    "## Suggested Goal Prompts",
    "- Goal: Improve ReadMates affected routes for the top repeated page-quality cause without changing product behavior.",
    "- Goal: Fix route entry failures separately before interpreting Lighthouse scores.",
    "",
    ],
  ).join("\n");
}

export async function writeLighthouseDiagnosticReport(
  input: WriteReportInput,
): Promise<ReportWriteResult> {
  await mkdir(input.outputDir, { recursive: true });
  const summaryPath = join(input.outputDir, "summary.md");
  const routesPath = join(input.outputDir, "routes.json");
  const findingsPath = join(input.outputDir, "findings.json");

  await writeFile(summaryPath, buildSummary(input), "utf8");
  await writeFile(
    routesPath,
    JSON.stringify(
      input.results.map((result) => ({
        routeId: result.routeId,
        group: result.group,
        path: result.path,
        mode: result.mode,
        status: result.status,
      })),
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(findingsPath, JSON.stringify(input.results, null, 2), "utf8");

  return { summaryPath, routesPath, findingsPath };
}
```

- [ ] **Step 4: Run report writer tests**

Run:

```bash
pnpm --dir front exec vitest run tests/lighthouse/report-writer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add front/tests/lighthouse/report-writer.ts front/tests/lighthouse/report-writer.test.ts
git commit -m "test(front): write lighthouse diagnostic reports"
```

---

### Task 4: Lighthouse Runner Boundary

**Files:**
- Create: `front/tests/lighthouse/lighthouse-runner.ts`
- Create: `front/tests/lighthouse/lighthouse-runner.test.ts`

**Interfaces:**
- Consumes: `LighthouseRouteDefinition`
- Consumes: `summarizeLhr(route, lhr)`
- Produces: `runRouteDiagnostic(context, route): Promise<RouteDiagnosticOutput>`
- Produces: `runLighthouseRoutes(context, routes): Promise<RouteDiagnosticOutput[]>`

- [ ] **Step 1: Write runner tests with mocked adapters**

Create `front/tests/lighthouse/lighthouse-runner.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { LighthouseRouteDefinition } from "./types";
import { runRouteDiagnostic } from "./lighthouse-runner";

const route: LighthouseRouteDefinition = {
  id: "public-home",
  group: "public",
  path: "/",
  mode: "navigation",
  auth: "none",
  description: "Public home",
  expectedText: "읽는사이",
};

describe("runRouteDiagnostic", () => {
  it("records route failure before running Lighthouse when route entry fails", async () => {
    const page = {
      goto: vi.fn(),
      waitForLoadState: vi.fn(),
      getByText: vi.fn(() => ({ waitFor: vi.fn().mockRejectedValue(new Error("missing text")) })),
    };
    const lighthouse = vi.fn();

    const result = await runRouteDiagnostic({
      baseUrl: "http://localhost:3100",
      page,
      lighthouse,
      outputDir: ".tmp/lighthouse/test",
    }, route);

    expect(result.status).toBe("route_failure");
    expect(result.failureReason).toContain("missing text");
    expect(lighthouse).not.toHaveBeenCalled();
  });

  it("summarizes Lighthouse output after route entry succeeds", async () => {
    const page = {
      goto: vi.fn(),
      waitForLoadState: vi.fn(),
      getByText: vi.fn(() => ({ waitFor: vi.fn().mockResolvedValue(undefined) })),
    };
    const lighthouse = vi.fn().mockResolvedValue({
      lhr: {
        categories: {
          performance: { score: 0.9 },
          accessibility: { score: 1 },
          "best-practices": { score: 1 },
          seo: { score: 1 },
        },
        audits: {},
      },
      report: ["{}", "<html></html>"],
    });

    const result = await runRouteDiagnostic({
      baseUrl: "http://localhost:3100",
      page,
      lighthouse,
      outputDir: ".tmp/lighthouse/test",
    }, route);

    expect(page.goto).toHaveBeenCalledWith("http://localhost:3100/");
    expect(lighthouse).toHaveBeenCalledWith("http://localhost:3100/", route);
    expect(result.status).toBe("passed");
    expect(result.scores.performance).toBe(0.9);
  });
});
```

- [ ] **Step 2: Run the failing runner tests**

Run:

```bash
pnpm --dir front exec vitest run tests/lighthouse/lighthouse-runner.test.ts
```

Expected: FAIL because `front/tests/lighthouse/lighthouse-runner.ts` does not exist.

- [ ] **Step 3: Add runner implementation**

Create `front/tests/lighthouse/lighthouse-runner.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { summarizeLhr } from "./finding-classifier";
import type {
  LighthouseRouteDefinition,
  NormalizedLighthouseResult,
} from "./types";

export type LighthouseAdapterResult = {
  lhr: unknown;
  report?: string | string[];
};

export type LighthouseAdapter = (
  url: string,
  route: LighthouseRouteDefinition,
) => Promise<LighthouseAdapterResult>;

export type RouteDiagnosticContext = {
  baseUrl: string;
  page: Pick<Page, "goto" | "waitForLoadState" | "getByText">;
  lighthouse: LighthouseAdapter;
  outputDir: string;
};

function absoluteUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

function reportPair(report: string | string[] | undefined) {
  if (Array.isArray(report)) {
    return { json: report[0] ?? "{}", html: report[1] ?? "" };
  }
  return { json: report ?? "{}", html: "" };
}

async function writeRawReports(
  outputDir: string,
  route: LighthouseRouteDefinition,
  lighthouseResult: LighthouseAdapterResult,
) {
  const resultsDir = join(outputDir, "results");
  const reportsDir = join(outputDir, "reports");
  await mkdir(resultsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  const pair = reportPair(lighthouseResult.report);
  const jsonPath = join(resultsDir, `${route.id}.json`);
  const htmlPath = join(reportsDir, `${route.id}.html`);

  await writeFile(jsonPath, pair.json, "utf8");
  await writeFile(htmlPath, pair.html, "utf8");

  return {
    reportJsonPath: `results/${route.id}.json`,
    reportHtmlPath: `reports/${route.id}.html`,
  };
}

function routeFailure(
  route: LighthouseRouteDefinition,
  failureReason: string,
): NormalizedLighthouseResult {
  return {
    routeId: route.id,
    group: route.group,
    path: route.path,
    mode: route.mode,
    status: "route_failure",
    scores: {
      performance: null,
      accessibility: null,
      bestPractices: null,
      seo: null,
    },
    findings: [
      {
        auditId: "route-entry",
        title: failureReason,
        score: null,
        numericValue: null,
        bucket: "route_data_failure",
      },
    ],
    failureReason,
  };
}

export async function runRouteDiagnostic(
  context: RouteDiagnosticContext,
  route: LighthouseRouteDefinition,
): Promise<NormalizedLighthouseResult> {
  const url = absoluteUrl(context.baseUrl, route.path);
  try {
    await context.page.goto(url);
    await context.page.waitForLoadState("networkidle");
    if (route.expectedText) {
      await context.page.getByText(route.expectedText, { exact: false }).waitFor({ timeout: 15_000 });
    }
  } catch (error) {
    return routeFailure(route, error instanceof Error ? error.message : String(error));
  }

  try {
    const lighthouseResult = await context.lighthouse(url, route);
    const reportPaths = await writeRawReports(context.outputDir, route, lighthouseResult);
    return Object.assign(
      summarizeLhr(route, lighthouseResult.lhr),
      reportPaths,
    );
  } catch (error) {
    return Object.assign(routeFailure(route, error instanceof Error ? error.message : String(error)), {
      status: "audit_failure",
      findings: [
        {
          auditId: "lighthouse-runtime",
          title: error instanceof Error ? error.message : String(error),
          score: null,
          numericValue: null,
          bucket: "audit_failure",
        },
      ],
    });
  }
}

export async function runLighthouseRoutes(
  context: RouteDiagnosticContext,
  routes: LighthouseRouteDefinition[],
) {
  const results: NormalizedLighthouseResult[] = [];
  for (const route of routes) {
    results.push(await runRouteDiagnostic(context, route));
  }
  return results;
}
```

- [ ] **Step 4: Run runner tests**

Run:

```bash
pnpm --dir front exec vitest run tests/lighthouse/lighthouse-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add front/tests/lighthouse/lighthouse-runner.ts front/tests/lighthouse/lighthouse-runner.test.ts
git commit -m "test(front): add lighthouse route runner boundary"
```

---

### Task 5: CLI, Real Lighthouse Adapter, And Package Wiring

**Files:**
- Create: `front/scripts/lighthouse-diagnostic.ts`
- Modify: `front/package.json`
- Modify: root `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `LIGHTHOUSE_ROUTE_INVENTORY`, `filterRoutes`, `runRouteDiagnostic`, `writeLighthouseDiagnosticReport`
- Produces: `pnpm --dir front lighthouse:diagnose`

- [ ] **Step 1: Add Lighthouse dependency**

Run:

```bash
pnpm --dir front add -D lighthouse
```

Expected: `front/package.json` and `pnpm-lock.yaml` change. Do not manually edit dependency versions.

- [ ] **Step 2: Add package scripts**

Modify `front/package.json` scripts:

```json
"lighthouse:diagnose": "tsx scripts/lighthouse-diagnostic.ts"
```

Modify root `package.json` scripts:

```json
"front:lighthouse": "pnpm --dir front lighthouse:diagnose"
```

- [ ] **Step 3: Create the CLI script**

Create `front/scripts/lighthouse-diagnostic.ts`:

```ts
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import lighthouse from "lighthouse";
import {
  LIGHTHOUSE_ROUTE_INVENTORY,
  filterRoutes,
} from "../tests/lighthouse/route-inventory";
import { runRouteDiagnostic, type LighthouseAdapter } from "../tests/lighthouse/lighthouse-runner";
import { writeLighthouseDiagnosticReport } from "../tests/lighthouse/report-writer";
import type {
  LighthouseRouteAuth,
  LighthouseRouteFilters,
  LighthouseRouteGroup,
} from "../tests/lighthouse/types";

type CliOptions = LighthouseRouteFilters & {
  outputDir: string;
  baseUrl: string;
};

const authLabels: Record<Exclude<LighthouseRouteAuth, "none">, string> = {
  member: "안멤버1",
  host: "김호스트 · 호스트",
  admin: "플랫폼 관리자 · OWNER",
};

function stringArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function parseGroup(value: string | undefined): LighthouseRouteGroup | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "public" || value === "member" || value === "host" || value === "admin") {
    return value;
  }
  throw new Error(`Unsupported --group value: ${value}`);
}

function parseLimit(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--limit must be a positive integer, received ${value}`);
  }
  return parsed;
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseCliOptions(): CliOptions {
  return {
    group: parseGroup(stringArg("--group")),
    routeId: stringArg("--route"),
    limit: parseLimit(stringArg("--limit")),
    outputDir: stringArg("--output") ?? resolve(process.cwd(), "..", ".tmp", "lighthouse", timestampSlug()),
    baseUrl: process.env.LIGHTHOUSE_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3100"}`,
  };
}

async function findFreePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolvePort(address.port);
        } else {
          reject(new Error("Unable to allocate a local debug port"));
        }
      });
    });
  });
}

async function ensureAuth(page: Page, auth: LighthouseRouteAuth, baseUrl: string) {
  if (auth === "none") {
    return;
  }
  await page.goto(new URL("/login", baseUrl).toString());
  await page.getByRole("button", { name: authLabels[auth] }).click();
  await page.waitForLoadState("networkidle");
}

function createLighthouseAdapter(port: number): LighthouseAdapter {
  return async (url, route) => {
    const modeFlags = route.mode === "navigation"
      ? {}
      : { disableStorageReset: true };
    return await lighthouse(url, Object.assign({
      port,
      output: ["json", "html"],
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    }, modeFlags));
  };
}

async function run() {
  const options = parseCliOptions();
  const routes = filterRoutes(LIGHTHOUSE_ROUTE_INVENTORY, options);
  if (routes.length === 0) {
    throw new Error("No Lighthouse routes matched the provided filters");
  }

  await mkdir(options.outputDir, { recursive: true });
  const debugPort = await findFreePort();
  const userDataDir = join(options.outputDir, "chromium-profile");
  const context: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    args: [`--remote-debugging-port=${debugPort}`],
  });

  try {
    const page = await context.newPage();
    const lighthouseAdapter = createLighthouseAdapter(debugPort);
    const results = [];
    let activeAuth: LighthouseRouteAuth = "none";

    for (const route of routes) {
      if (route.auth !== activeAuth) {
        await ensureAuth(page, route.auth, options.baseUrl);
        activeAuth = route.auth;
      }
      results.push(await runRouteDiagnostic({
        baseUrl: options.baseUrl,
        page,
        lighthouse: lighthouseAdapter,
        outputDir: options.outputDir,
      }, route));
    }

    const report = await writeLighthouseDiagnosticReport({
      outputDir: options.outputDir,
      runContext: {
        commit: process.env.GITHUB_SHA ?? "local",
        timestamp: new Date().toISOString(),
        deviceProfile: "desktop-chromium",
        serverProfile: "local-dev",
      },
      results,
    });

    console.log(`Lighthouse diagnostic complete: ${report.summaryPath}`);
  } finally {
    await context.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Run focused unit tests**

Run:

```bash
pnpm --dir front exec vitest run tests/lighthouse
```

Expected: PASS.

- [ ] **Step 5: Run CLI help-free filter failure check**

Run:

```bash
pnpm --dir front lighthouse:diagnose -- --group unknown
```

Expected: FAIL with `Unsupported --group value: unknown`.

- [ ] **Step 6: Commit Task 5**

```bash
git add front/scripts/lighthouse-diagnostic.ts front/package.json package.json pnpm-lock.yaml
git commit -m "feat(front): wire lighthouse diagnostic cli"
```

---

### Task 6: Local Smoke, Docs, And Final Verification

**Files:**
- Modify: `docs/development/test-guide.md`

**Interfaces:**
- Consumes: `pnpm --dir front lighthouse:diagnose`
- Produces: documented local diagnostic command

- [ ] **Step 1: Add a test guide section**

In `docs/development/test-guide.md`, add this section near the frontend/E2E testing sections:

````md
## Lighthouse Diagnostic

The local Lighthouse diagnostic is a non-gating quality baseline for public, member, host, and platform-admin dev-seed routes. It writes artifacts under `.tmp/lighthouse/` and separates route entry failures from Lighthouse findings.

Run a small smoke first:

```bash
pnpm --dir front lighthouse:diagnose -- --group public --limit 2
pnpm --dir front lighthouse:diagnose -- --group member --limit 1
```

Run the full desktop baseline after the local MySQL, Spring dev profile, and Vite server path used by Playwright E2E is healthy:

```bash
pnpm --dir front lighthouse:diagnose
```

Do not treat the first baseline as a CI gate. Use `summary.md` and `findings.json` to create scoped follow-up goals.
````

- [ ] **Step 2: Run docs check**

Run:

```bash
git diff --check -- docs/development/test-guide.md
```

Expected: no output and exit code 0.

- [ ] **Step 3: Run frontend unit tests for the new harness**

Run:

```bash
pnpm --dir front exec vitest run tests/lighthouse
```

Expected: PASS.

- [ ] **Step 4: Run standard frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all pass.

- [ ] **Step 5: Run local Lighthouse smoke if local servers are available**

Run:

```bash
pnpm --dir front lighthouse:diagnose -- --group public --limit 2
```

Expected: command writes `.tmp/lighthouse/<timestamp>/summary.md` and exits 0.

If local MySQL, Spring, or Vite is unavailable, skip this command and record the exact missing prerequisite in the final handoff.

- [ ] **Step 6: Verify generated artifacts are untracked**

Run:

```bash
git status --short .tmp front/test-results front/playwright-report
```

Expected: no tracked changes from Lighthouse artifacts. `.tmp/lighthouse/` may exist locally but must not be staged.

- [ ] **Step 7: Commit Task 6**

```bash
git add docs/development/test-guide.md
git commit -m "docs: document lighthouse diagnostic"
```

---

## Final Verification Before Completion

Run these commands before reporting implementation complete:

```bash
pnpm --dir front exec vitest run tests/lighthouse
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
git diff --check
```

Run this smoke when local dev services are available:

```bash
pnpm --dir front lighthouse:diagnose -- --group public --limit 2
```

Report any skipped command with the exact reason. Do not claim Lighthouse smoke passed if local services were not running.

## Self-Review

- Spec coverage: Tasks 1 through 6 cover route inventory, desktop-only baseline, Playwright-controlled auth, Lighthouse output, report artifacts, cause buckets, CLI filters, non-gating operation, docs, and verification.
- Placeholder scan: This plan contains no incomplete file paths and no unspecified follow-up steps.
- Type consistency: `LighthouseRouteDefinition`, `LighthouseRouteFilters`, `LighthouseCauseBucket`, `NormalizedLighthouseResult`, `runRouteDiagnostic`, and `writeLighthouseDiagnosticReport` are defined before use by later tasks.
