# ReadMates Release Risk Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `v1.13.0` 릴리스 전에 `/admin/analytics` frontend/server 배포 순서 skew를 하위호환 normalization으로 막고, deploy-server workflow와 release 문서를 실제 품질 gate와 backend-first smoke 순서에 맞춘다.

**Architecture:** 프론트 API boundary에서 wire payload를 UI model로 normalize해 `series` 누락 응답을 `series: []`로 안전하게 수용한다. 운영 절차는 workflow dependency를 새로 만들지 않고, release note/runbook에 server image promote와 OCI backend promotion 이후 final frontend/admin smoke를 명시한다. deploy-server workflow는 CI backend와 같은 `check` gate를 실행한 뒤 release jar를 만든다.

**Tech Stack:** React/Vite, TypeScript, Zod, Vitest, Playwright, GitHub Actions, Kotlin/Spring Boot release workflow, Bash public-release scanner.

**Spec:** `docs/superpowers/specs/2026-06-07-readmates-release-risk-remediation-design.md`

---

## File Structure

- Modify: `front/features/platform-admin/api/platform-admin-analytics-contracts.ts` - analytics wire payload parser and normalization.
- Modify: `front/features/platform-admin/api/platform-admin-analytics-contracts.test.ts` - v1/missing-series compatibility tests.
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.test.ts` - CSV behavior for empty trend series.
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.test.tsx` - empty trend UI state.
- Modify: `.github/workflows/deploy-server.yml` - use `clean check bootJar`.
- Modify: `CHANGELOG.md` - promote `Unreleased` to `v1.13.0` notes or add deployment notes if release prep is separated.
- Modify: `docs/deploy/release-publish-runbook.md` - backend-first final smoke rule for server/API/frontend contract releases.
- Modify: `docs/development/release-readiness-review.md` - record remediation evidence and remaining post-tag smoke risk.

---

## Task 1: Admin Analytics Wire Compatibility

**Files:**
- Modify: `front/features/platform-admin/api/platform-admin-analytics-contracts.ts`
- Modify: `front/features/platform-admin/api/platform-admin-analytics-contracts.test.ts`

- [ ] **Step 1: Add the failing compatibility test**

Append this test to `front/features/platform-admin/api/platform-admin-analytics-contracts.test.ts`:

```ts
it("normalizes an older overview payload without KPI series", async () => {
  const { parseAdminAnalyticsOverview } = await import("./platform-admin-analytics-contracts");
  const legacyPayload = {
    ...validOverview,
    schema: "admin.analytics_overview.v1",
  };
  delete (legacyPayload as { series?: unknown }).series;

  expect(parseAdminAnalyticsOverview(legacyPayload)).toMatchObject({
    schema: "admin.analytics_overview.v2",
    series: [],
    kpis: [{ key: "SESSION_COMPLETION" }],
  });
});
```

Run:

```bash
pnpm --dir front test -- features/platform-admin/api/platform-admin-analytics-contracts.test.ts
```

Expected before implementation: FAIL because the current DEV Zod schema requires `schema="admin.analytics_overview.v2"` and a required `series` field.

- [ ] **Step 2: Replace the schema with wire schema + normalizer**

Replace `front/features/platform-admin/api/platform-admin-analytics-contracts.ts` with this structure, preserving the existing imports:

```ts
import { z } from "zod";
import type {
  AdminAnalyticsKpiSeries,
  AdminAnalyticsOverview,
} from "@/features/platform-admin/model/platform-admin-analytics-model";

const KpiKeySchema = z.enum([
  "ACTIVE_MEMBERS",
  "SESSION_COMPLETION",
  "RSVP_RATE",
  "AI_COST_PER_SESSION",
  "NOTIFICATION_DELIVERY",
]);

const UnitSchema = z.enum(["COUNT", "PERCENT", "USD"]);
const AvailabilitySchema = z.enum(["AVAILABLE", "NOT_ENOUGH_DATA", "MEASUREMENT_UNAVAILABLE"]);

const KpiSchema = z.object({
  key: KpiKeySchema,
  unit: UnitSchema,
  availability: AvailabilitySchema,
  current: z.number().nullable(),
  prior: z.number().nullable(),
  deltaDirection: z.enum(["UP", "DOWN", "FLAT", "NONE"]),
});

const BenchmarkSchema = z.object({
  availability: AvailabilitySchema,
  rows: z.array(
    z.object({
      clubId: z.string(),
      slug: z.string(),
      name: z.string(),
      activeMembers: z.number(),
      sessionCompletionRate: z.number().nullable(),
      rsvpRate: z.number().nullable(),
      aiCostUsd: z.string(),
      notificationDeliveryRate: z.number().nullable(),
    }),
  ),
});

const SeriesSchema = z.array(
  z.object({
    key: KpiKeySchema,
    unit: UnitSchema,
    points: z.array(
      z.object({
        bucketStart: z.string(),
        availability: AvailabilitySchema,
        value: z.number().nullable(),
      }),
    ),
  }),
);

export const AdminAnalyticsWireOverviewSchema = import.meta.env.DEV
  ? z.object({
      schema: z.enum(["admin.analytics_overview.v1", "admin.analytics_overview.v2"]),
      generatedAt: z.string(),
      window: z.enum(["7d", "30d", "90d"]),
      kpis: z.array(KpiSchema),
      clubBenchmark: BenchmarkSchema,
      series: SeriesSchema.optional().default([]),
    })
  : (null as never);

type AdminAnalyticsWireOverview = Omit<AdminAnalyticsOverview, "schema" | "series"> & {
  schema: "admin.analytics_overview.v1" | "admin.analytics_overview.v2";
  series?: AdminAnalyticsKpiSeries[];
};

function normalizeAdminAnalyticsOverview(value: AdminAnalyticsWireOverview): AdminAnalyticsOverview {
  return {
    ...value,
    schema: "admin.analytics_overview.v2",
    series: Array.isArray(value.series) ? value.series : [],
  };
}

export function parseAdminAnalyticsOverview(value: unknown): AdminAnalyticsOverview {
  if (import.meta.env.DEV) {
    return normalizeAdminAnalyticsOverview(AdminAnalyticsWireOverviewSchema.parse(value));
  }

  return normalizeAdminAnalyticsOverview(value as AdminAnalyticsWireOverview);
}
```

- [ ] **Step 3: Verify the focused contract tests pass**

Run:

```bash
pnpm --dir front test -- features/platform-admin/api/platform-admin-analytics-contracts.test.ts
```

Expected: PASS. Existing test `throws when a nested KPI delta direction is missing` must still throw, proving the DEV parser did not become loose for required nested fields.

- [ ] **Step 4: Commit task 1**

```bash
git add front/features/platform-admin/api/platform-admin-analytics-contracts.ts \
        front/features/platform-admin/api/platform-admin-analytics-contracts.test.ts
git commit -m "fix(front): tolerate legacy admin analytics overview payload"
```

---

## Task 2: Empty Trend UI and CSV Regression Coverage

**Files:**
- Modify: `front/features/platform-admin/ui/admin-analytics-overview.test.tsx`
- Modify: `front/features/platform-admin/model/platform-admin-analytics-model.test.ts`

- [ ] **Step 1: Add UI empty-series coverage**

Append this test to `front/features/platform-admin/ui/admin-analytics-overview.test.tsx`:

```tsx
it("renders an honest empty trend state when KPI series are unavailable", () => {
  render(
    <AdminAnalyticsOverviewView
      overview={{ ...overview, series: [] }}
      window="30d"
      loading={false}
      error={null}
      onWindowChange={vi.fn()}
    />,
  );

  expect(screen.getByText("KPI 추세를 만들 충분한 데이터가 없습니다.")).toBeInTheDocument();
  expect(screen.queryByRole("table", { name: "KPI 추세" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "CSV 내려받기" })).toHaveAttribute(
    "download",
    "readmates-admin-analytics-30d-2026-05-30.csv",
  );
});
```

Run:

```bash
pnpm --dir front test -- features/platform-admin/ui/admin-analytics-overview.test.tsx
```

Expected: PASS. No UI implementation change should be needed because `AdminAnalyticsSeriesTable` already handles `series.length === 0`.

- [ ] **Step 2: Add CSV empty-series coverage**

Append this test to `front/features/platform-admin/model/platform-admin-analytics-model.test.ts`:

```ts
it("builds a CSV export when KPI series are unavailable", () => {
  const overview: AdminAnalyticsOverview = {
    schema: "admin.analytics_overview.v2",
    generatedAt: "2026-05-30T00:00:00Z",
    window: "30d",
    kpis: [card({ key: "SESSION_COMPLETION", unit: "PERCENT", current: 80, prior: 50 })],
    clubBenchmark: {
      availability: "AVAILABLE",
      rows: [
        {
          clubId: "club-1",
          slug: "fiction",
          name: "Fiction Club",
          activeMembers: 8,
          sessionCompletionRate: 75,
          rsvpRate: 90,
          aiCostUsd: "1.0000",
          notificationDeliveryRate: 95,
        },
      ],
    },
    series: [],
  };

  const csv = buildAnalyticsCsv(overview);

  expect(csv).toContain("section,window,kpi,bucketStart,value,availability,clubSlug,clubName");
  expect(csv).not.toContain("series,30d");
  expect(csv).toContain("benchmark,30d,,,,AVAILABLE,fiction,Fiction Club");
});
```

Run:

```bash
pnpm --dir front test -- features/platform-admin/model/platform-admin-analytics-model.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the admin analytics focused front tests together**

Run:

```bash
pnpm --dir front test -- \
  features/platform-admin/api/platform-admin-analytics-contracts.test.ts \
  features/platform-admin/model/platform-admin-analytics-model.test.ts \
  features/platform-admin/ui/admin-analytics-overview.test.tsx \
  features/platform-admin/route/admin-analytics-route.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit task 2**

```bash
git add front/features/platform-admin/ui/admin-analytics-overview.test.tsx \
        front/features/platform-admin/model/platform-admin-analytics-model.test.ts
git commit -m "test(front): cover admin analytics empty trend compatibility"
```

---

## Task 3: Deploy Server Workflow Quality Gate

**Files:**
- Modify: `.github/workflows/deploy-server.yml`

- [ ] **Step 1: Update the deploy-server Gradle command**

In `.github/workflows/deploy-server.yml`, replace:

```yaml
      - name: Test and build server jar
        run: ./server/gradlew -p server clean test bootJar
```

with:

```yaml
      - name: Server quality gate and build jar
        run: ./server/gradlew -p server clean check bootJar
```

Rationale: `check` is the CI backend quality gate and avoids a tag deploy step claiming "Test" while Gradle skips the `test` task.

- [ ] **Step 2: Verify patch formatting**

Run:

```bash
git diff --check -- .github/workflows/deploy-server.yml
```

Expected: no output.

- [ ] **Step 3: Commit task 3**

```bash
git add .github/workflows/deploy-server.yml
git commit -m "ci(server): run backend quality gate before release image build"
```

---

## Task 4: Release Notes and Runbook Ordering

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/deploy/release-publish-runbook.md`
- Modify: `docs/development/release-readiness-review.md`

- [ ] **Step 1: Promote `CHANGELOG.md` Unreleased to `v1.13.0`**

Replace the current `## Unreleased` section heading with:

```markdown
## v1.13.0 - 2026-06-07
```

Then add this `### Deployment Notes` section after the existing `### Testing` section:

```markdown
### Deployment Notes

- Minor release. DB migration 없음. Auth/BFF token, OAuth scope, secret/session handling 변경 없음.
- Public API contract는 additive입니다. `/api/admin/analytics/overview`는 `admin.analytics_overview.v2`로 KPI trend `series`를 포함하고, my-page 응답은 `completedReadingCount`와 최근 회차 `readingProgress`를 포함합니다.
- 서버/API/frontend contract가 함께 바뀌므로 release tag push 후 `Deploy Server Image`가 GHCR `readmates-server:v1.13.0`을 scan/promote한 것을 먼저 확인하고, OCI Compose backend를 같은 image tag로 올린 뒤 final frontend/admin smoke를 수행합니다. Cloudflare Pages `Deploy Front`는 tag push로 독립 실행될 수 있으나, 새 frontend는 구 analytics 응답의 누락된 `series`를 빈 trend 상태로 normalize합니다.
- 운영 smoke는 `/internal/health`, BFF auth, OAuth redirect, OWNER 또는 OPERATOR `/admin/analytics` 렌더링을 포함합니다. 실제 운영 domain, VM IP, member data, provider state, secret 값은 Git에 남기지 않습니다.
```

Then add this `### Verification` section:

```markdown
### Verification

- Local release readiness (2026-06-07): `git diff --check v1.12.1..HEAD` - pass.
- Local release readiness (2026-06-07): `pnpm --dir front lint` - pass.
- Local release readiness (2026-06-07): `pnpm --dir front test` - pass (134 files, 1139 tests).
- Local release readiness (2026-06-07): `pnpm --dir front build` - pass.
- Local release readiness (2026-06-07): `./server/gradlew -p server clean check architectureTest integrationTest --tests RedisAiGenerationJobStoreTest` - pass.
- Local release readiness (2026-06-07): `pnpm --dir front test:e2e` - pass (61/61).
- Local release readiness (2026-06-07): `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` - pass; gitleaks found no leaks.
- Skipped before tag: production OAuth, VM, provider-console, release tag deploy smoke. These are release-operation steps after tag push, not local evidence.
```

If the implementation runs a broader or different command set, update the verification bullets to the actual outputs only.

- [ ] **Step 2: Restore an empty `Unreleased` section at top**

Immediately above `## v1.13.0 - 2026-06-07`, add:

```markdown
## Unreleased

(없음)
```

The release guard expects an explicit current `Unreleased` section.

- [ ] **Step 3: Update release publish runbook ordering**

In `docs/deploy/release-publish-runbook.md`, insert this note after line 87, below the workflow explanation:

```markdown
서버/API/frontend contract가 함께 바뀐 릴리스에서는 `Deploy Front` 성공만으로 final smoke를 끝내지 않습니다. `Deploy Server Image`가 같은 tag의 GHCR image를 promote하고, OCI Compose backend promotion이 끝난 뒤 frontend-facing smoke를 최종 판정으로 삼습니다. 새 frontend가 구 backend를 잠시 만날 수 있는 tag-push window는 frontend 하위호환 처리로 완화하되, release 완료 판정은 backend promotion 이후에만 내립니다.
```

Then move or duplicate the backend-first condition before the `## Frontend Smoke` section:

```markdown
서버 코드, API contract, DB migration, BFF/auth, 또는 frontend가 소비하는 server response shape가 바뀐 릴리스는 `Backend OCI Promotion`을 먼저 완료한 뒤 이 섹션의 frontend smoke를 final smoke로 실행합니다. frontend-only 릴리스는 Cloudflare Pages 성공 뒤 바로 이 섹션을 실행할 수 있습니다.
```

Do not add real domain, VM IP, or account details.

- [ ] **Step 4: Add release-readiness remediation note**

Append this section before `## 기본 범위` in `docs/development/release-readiness-review.md`:

```markdown
## 2026-06-07 v1.13.0 release-risk remediation note

- Scope reviewed: `v1.12.1..HEAD`, with current local `main` ahead of `origin/main`.
- Finding repaired: new frontend `/admin/analytics` can now normalize older `admin.analytics_overview.v1` or missing-`series` payloads into the v2 UI model with `series=[]`, avoiding a tag-push window where Cloudflare Pages deploys before OCI backend promotion.
- Finding repaired: `Deploy Server Image` now runs `./server/gradlew -p server clean check bootJar`, aligning release-image build verification with the backend CI quality gate instead of the skipped `test` task.
- Release classification: minor release (`v1.13.0`). No DB migration. Public API contract changes are additive, but server/API/frontend contract surfaces changed and require backend promotion before final frontend/admin smoke.
- Required post-tag operations: confirm `Deploy Server Image`, promote OCI Compose backend to `ghcr.io/<owner>/<repo>/readmates-server:v1.13.0`, confirm `Deploy Front`, then run sanitized BFF/OAuth/admin analytics smoke.
- Residual risk: production tag/deploy smoke remains open until the release operation runs. This local remediation does not prove production OAuth, VM health, provider-console state, or GHCR promotion.
```

Adjust the "Finding repaired" wording only after the code/workflow tasks are actually implemented.

- [ ] **Step 5: Verify docs formatting**

Run:

```bash
git diff --check -- CHANGELOG.md docs/deploy/release-publish-runbook.md docs/development/release-readiness-review.md
```

Expected: no output.

- [ ] **Step 6: Commit task 4**

```bash
git add CHANGELOG.md docs/deploy/release-publish-runbook.md docs/development/release-readiness-review.md
git commit -m "docs: prepare v1.13.0 release risk remediation"
```

---

## Task 5: Full Verification

**Files:** no new edits unless verification exposes a defect.

- [ ] **Step 1: Run frontend baseline**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected:

- lint exits 0.
- Vitest exits 0 and includes the new admin analytics compatibility tests.
- Vite build exits 0.

- [ ] **Step 2: Run backend and release safety baseline**

Run:

```bash
./server/gradlew -p server clean check architectureTest integrationTest --tests RedisAiGenerationJobStoreTest
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected:

- Gradle exits 0. `check` includes ktlint, detekt, unitTest, JaCoCo, architectureTest.
- Public release candidate is built.
- Public release check passes and gitleaks reports no leaks.

- [ ] **Step 3: Run E2E**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: all Playwright specs pass. If a browser/runtime blocker prevents execution, record the exact blocker in `docs/development/release-readiness-review.md` and do not claim E2E passed.

- [ ] **Step 4: Check working tree**

Run:

```bash
git status --short --branch
```

Expected: only intentional implementation commits are present; no generated untracked release artifacts are staged.

---

## Task 6: Release Operation Handoff

**Files:** `CHANGELOG.md` and `docs/development/release-readiness-review.md` only if post-tag evidence is later recorded.

- [ ] **Step 1: Confirm local release readiness**

Before tagging, confirm the latest local evidence from Task 5 is recorded in `CHANGELOG.md` `v1.13.0` Verification and `docs/development/release-readiness-review.md`.

- [ ] **Step 2: Tag and monitor workflows**

Run only when the user explicitly asks to publish the release:

```bash
git tag -a v1.13.0 -m "ReadMates v1.13.0"
git push origin main
git push origin v1.13.0
gh run list --workflow "Deploy Server Image" --branch v1.13.0 --limit 5
gh run list --workflow "Deploy Front" --branch v1.13.0 --limit 5
```

Expected: both workflow runs appear for tag `v1.13.0`.

- [ ] **Step 3: Backend promotion before final frontend/admin smoke**

After `Deploy Server Image` succeeds, run the OCI Compose promotion outside Git with placeholders resolved in the operator environment:

```bash
READMATES_SERVER_IMAGE='ghcr.io/<owner>/<repo>/readmates-server:v1.13.0' \
VM_PUBLIC_IP='<vm-public-ip>' \
CADDY_SITE=api.example.com \
./deploy/oci/05-deploy-compose-stack.sh
```

Expected: script reports healthy backend and post-deploy watch success. Do not paste private output into Git.

- [ ] **Step 4: Final sanitized smoke**

Run:

```bash
curl -fsS https://app.example.com/api/bff/api/auth/me
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://app.example.com/oauth2/authorization/google
READMATES_SMOKE_BASE_URL=https://app.example.com \
READMATES_SMOKE_AUTH_BASE_URL=https://app.example.com \
./scripts/smoke-production-integrations.sh
```

Then verify `/admin/analytics` with an OWNER or OPERATOR account in a private browser session:

- page loads without runtime crash,
- KPI cards render,
- KPI trend table renders when `series` is available or the empty trend state renders when not enough data exists,
- no raw member data, provider transcript, secret, or private deployment identifier is captured in notes.

- [ ] **Step 5: Record post-tag evidence**

Append sanitized summary to `docs/development/release-readiness-review.md`:

```markdown
- Production deployment (2026-06-07): `Deploy Server Image` for tag `v1.13.0` - pass; image scan and release-tag promotion completed.
- Production deployment (2026-06-07): OCI Compose backend promotion to `readmates-server:v1.13.0` - pass; API health and post-deploy watch passed.
- Production deployment (2026-06-07): `Deploy Front` for tag `v1.13.0` - pass.
- Production smoke (2026-06-07): BFF auth, OAuth redirect, and OWNER/OPERATOR `/admin/analytics` smoke passed. No credentials, cookies, member identifiers, provider transcripts, or private deployment identifiers were captured.
```

Commit only after the evidence is true:

```bash
git add docs/development/release-readiness-review.md
git commit -m "docs: record v1.13.0 deploy closure"
```

---

## Self-Review Checklist

- [ ] Spec requirement "legacy analytics payload does not crash new frontend" maps to Tasks 1 and 2.
- [ ] Spec requirement "backend-first final smoke is documented" maps to Task 4 and Task 6.
- [ ] Spec requirement "deploy-server workflow runs real quality gate" maps to Task 3.
- [ ] Spec requirement "public safety and post-tag residuals are explicit" maps to Tasks 4, 5, and 6.
- [ ] No implementation step relies on private data, real VM identifiers, secrets, or real member data.
- [ ] No task claims production deployment success before the post-tag operation runs.
