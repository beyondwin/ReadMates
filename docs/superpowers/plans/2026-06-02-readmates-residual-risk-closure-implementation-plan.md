# ReadMates Residual Risk Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all remaining release risks found in the 2026-06-02 ReadMates analysis: the failing notes feed query-plan guard, stale release-readiness evidence, shallow contract checks, and missing DEV parser wiring.

**Architecture:** Keep the current route-first frontend and server clean-architecture boundaries. Repair the notes feed SQL inside its read-side persistence adapter, deepen contract checks in the existing MockMvc fixture test, and wire DEV-only parsers through feature API clients without changing production runtime behavior.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Vite, Vitest, Playwright, Kotlin/Spring Boot, JdbcTemplate, MySQL/Flyway, Gradle.

---

## Current Baseline

The implementation starts from this observed state:

- `git status --short --branch` reports `main...origin/main [ahead 23]`.
- `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, and focused visual E2E passed on 2026-06-02.
- `./scripts/build-public-release-candidate.sh` and `./scripts/public-release-check.sh .tmp/public-release-candidate` passed on 2026-06-02.
- `./server/gradlew -p server clean test` returned `BUILD SUCCESSFUL`, but the `test` task was `SKIPPED`.
- Targeted server integration failed:

```text
./server/gradlew -p server integrationTest \
  --tests com.readmates.contract.FrontendZodSchemaContractTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```

Failure:

```text
MySqlQueryPlanTest > notes feed union branches use indexed access on every source table() FAILED
questions accessType=ALL, key=null
```

## File Structure

### Query-plan repair

- Modify: `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
  - Owns the production notes feed SQL.
- Modify: `server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt`
  - Owns the EXPLAIN guard SQL mirror and indexed-access assertions.

### Contract confidence

- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`
  - Upgrades top-level key comparison to recursive object key-set comparison.
- Modify: `front/shared/model/current-session-contracts.ts`
  - Adds `parseCurrentSessionResponse(...)`.
- Modify: `front/features/current-session/api/current-session-contracts.ts`
  - Re-exports the parser.
- Modify: `front/features/current-session/api/current-session-api.ts`
  - Uses the parser after fetch.
- Modify: `front/features/current-session/api/current-session-contracts.test.ts`
  - Pins canonical ownership and DEV parser behavior.
- Modify: `front/features/platform-admin/api/platform-admin-analytics-contracts.ts`
  - Adds `parseAdminAnalyticsOverview(...)`.
- Modify: `front/features/platform-admin/api/platform-admin-analytics-api.ts`
  - Uses the parser after fetch.
- Test: `front/features/platform-admin/api/platform-admin-analytics-contracts.test.ts`
  - New focused parser test.

### Documentation

- Modify: `docs/development/release-readiness-review.md`
  - Records the observed failure and repaired closure evidence.
- Modify: `docs/development/adr/0009-frontend-backend-contract-via-zod.md`
  - Updates contract-test limitation wording after recursive comparison lands.
- Modify: `docs/development/test-guide.md`
  - Clarifies targeted server lanes for query-plan/contract confidence.
- Modify: `CHANGELOG.md`
  - Records the residual risk closure under `## Unreleased`.

## Task 1: Repair Notes Feed Query-Plan Failure

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt`

- [ ] **Step 1: Run the existing failing test**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.MySqlQueryPlanTest
```

Expected before the fix:

```text
notes feed union branches use indexed access on every source table() FAILED
questions accessType=ALL, key=null
```

- [ ] **Step 2: Pin the production notes feed question branch to the existing index**

In `JdbcNotesFeedAdapter.kt`, inside `loadNotesFeed(...)`, change the question branch from:

```sql
from questions
join sessions on sessions.id = questions.session_id
```

to:

```sql
from questions force index (questions_club_session_created_idx)
join sessions on sessions.id = questions.session_id
```

Keep the existing join and where predicates unchanged:

```sql
and sessions.club_id = questions.club_id
...
where questions.club_id = ?
  and sessions.state = 'PUBLISHED'
  and sessions.visibility in ('MEMBER', 'PUBLIC')
```

- [ ] **Step 3: Keep the EXPLAIN guard SQL aligned with production**

In `MySqlQueryPlanTest.kt`, update `NOTES_FEED_PLAN_SQL` the same way:

```sql
from questions force index (questions_club_session_created_idx)
join sessions on sessions.id = questions.session_id and sessions.club_id = questions.club_id
```

Do not change these assertions:

```kotlin
plan.assertUsesIndexFor("questions", "notes feed question branch")
plan.assertUsesIndexFor("long_reviews", "notes feed long-review branch")
plan.assertUsesIndexFor("one_line_reviews", "notes feed one-line review branch")
plan.assertUsesIndexFor("highlights", "notes feed highlight branch")
plan.assertUsesIndexFor("sessions", "notes feed session join")
plan.assertUsesIndexFor("session_participants", "notes feed active participant filter")
```

- [ ] **Step 4: Verify the query-plan repair**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.MySqlQueryPlanTest
```

Expected:

```text
BUILD SUCCESSFUL
```

If this still fails, inspect the report:

```bash
open server/build/reports/tests/integrationTest/classes/com.readmates.performance.MySqlQueryPlanTest.html
```

The repair is not complete until `questions` has a targeted indexed access type and a non-empty key.

## Task 2: Deepen Frontend/Server Contract Shape Checks

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`

- [ ] **Step 1: Add a recursive key assertion helper**

In `FrontendZodSchemaContractTest.kt`, replace the body of `assertTopLevelKeySetMatches(...)` with a recursive call and add helpers below it.

Use this implementation:

```kotlin
private fun assertTopLevelKeySetMatches(
    actualJson: String,
    fixtureFileName: String,
) {
    val fixtureFile = zodFixturesDir.resolve(fixtureFileName).toFile()
    check(fixtureFile.exists()) {
        "Frontend zod schema fixture file not found: ${fixtureFile.absolutePath}. " +
            "Run `pnpm --dir front zod:export-fixtures` to generate fixtures, " +
            "then ensure 'readmates.frontend.zod.fixtures.dir' points to " +
            "front/tests/unit/__fixtures__/zod-schemas."
    }

    val actual: JsonNode = objectMapper.readTree(actualJson)
    val expected: JsonNode = objectMapper.readTree(fixtureFile)

    assertJsonShapeMatches(
        actual = actual,
        expected = expected,
        path = "$",
        fixtureFileName = fixtureFileName,
    )
}

private fun assertJsonShapeMatches(
    actual: JsonNode,
    expected: JsonNode,
    path: String,
    fixtureFileName: String,
) {
    if (expected.isObject) {
        assertObjectKeysMatch(actual, expected, path, fixtureFileName)
        expected.propertyNames().forEachRemaining { key ->
            assertJsonShapeMatches(
                actual = actual.get(key),
                expected = expected.get(key),
                path = "$path.$key",
                fixtureFileName = fixtureFileName,
            )
        }
        return
    }

    if (expected.isArray && expected.size() > 0 && actual.isArray && actual.size() > 0) {
        assertJsonShapeMatches(
            actual = actual.get(0),
            expected = expected.get(0),
            path = "$path[0]",
            fixtureFileName = fixtureFileName,
        )
    }
}

private fun assertObjectKeysMatch(
    actual: JsonNode?,
    expected: JsonNode,
    path: String,
    fixtureFileName: String,
) {
    assertThat(actual?.isObject)
        .describedAs("JSON node at $path from '$fixtureFileName' must be an object")
        .isTrue()

    val actualKeys = actual!!.propertyNames().toSet()
    val expectedKeys = expected.propertyNames().toSet()

    assertThat(actualKeys)
        .describedAs(
            "JSON key set at $path from server response must match zod schema fixture '$fixtureFileName'.\n" +
                "Keys in server response but not in zod fixture: ${actualKeys - expectedKeys}\n" +
                "Keys in zod fixture but not in server response: ${expectedKeys - actualKeys}",
        ).isEqualTo(expectedKeys)
}
```

- [ ] **Step 2: Run the contract test**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.contract.FrontendZodSchemaContractTest
```

Expected:

```text
BUILD SUCCESSFUL
```

If it fails because a fixture array is empty while the actual array has fields, do not weaken the recursive object comparison. Instead, decide whether that endpoint needs a representative fixture element and update `front/scripts/export-zod-fixtures.ts` consistently.

## Task 3: Wire DEV Parser for Current Session

**Files:**
- Modify: `front/shared/model/current-session-contracts.ts`
- Modify: `front/features/current-session/api/current-session-contracts.ts`
- Modify: `front/features/current-session/api/current-session-api.ts`
- Modify: `front/features/current-session/api/current-session-contracts.test.ts`

- [ ] **Step 1: Add parser tests for current-session**

Append these tests to `front/features/current-session/api/current-session-contracts.test.ts`:

```ts
describe("/api/sessions/current zod parser", () => {
  const valid = {
    currentSession: {
      sessionId: "session-1",
      sessionNumber: 1,
      title: "1회차 · 테스트 책",
      bookTitle: "테스트 책",
      bookAuthor: "테스트 저자",
      bookLink: null,
      bookImageUrl: null,
      date: "2026-05-20",
      startTime: "20:00",
      endTime: "22:00",
      locationLabel: "온라인",
      meetingUrl: null,
      meetingPasscode: null,
      questionDeadlineAt: "2026-05-19T14:59:00Z",
      myRsvpStatus: "GOING",
      myCheckin: { readingProgress: 80 },
      myQuestions: [],
      myOneLineReview: null,
      myLongReview: null,
      board: {
        questions: [],
        longReviews: [],
      },
      attendees: [
        {
          membershipId: "membership-1",
          displayName: "테스트 멤버",
          accountName: "테스트 계정",
          role: "MEMBER",
          rsvpStatus: "GOING",
          attendanceStatus: "UNKNOWN",
          participationStatus: "ACTIVE",
        },
      ],
    },
  };

  it("parses a valid current-session response", async () => {
    const { parseCurrentSessionResponse } = await import("@/features/current-session/api/current-session-contracts");

    expect(parseCurrentSessionResponse(valid)).toMatchObject({
      currentSession: {
        sessionId: "session-1",
        attendees: [{ rsvpStatus: "GOING" }],
      },
    });
  });

  it("throws when a nested attendee field is missing", async () => {
    const { parseCurrentSessionResponse } = await import("@/features/current-session/api/current-session-contracts");
    const invalid = {
      ...valid,
      currentSession: {
        ...valid.currentSession,
        attendees: [{ ...valid.currentSession.attendees[0], rsvpStatus: undefined }],
      },
    };

    expect(() => parseCurrentSessionResponse(invalid)).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused frontend test and verify it fails**

Run:

```bash
pnpm --dir front test -- features/current-session/api/current-session-contracts.test.ts
```

Expected before implementation: FAIL because `parseCurrentSessionResponse` is not exported.

- [ ] **Step 3: Add the parser in the shared canonical contract**

In `front/shared/model/current-session-contracts.ts`, add:

```ts
export function parseCurrentSessionResponse(value: unknown): CurrentSessionResponse {
  if (import.meta.env.DEV) {
    return CurrentSessionResponseSchema.parse(value) as CurrentSessionResponse;
  }
  return value as CurrentSessionResponse;
}
```

- [ ] **Step 4: Re-export the parser from the feature contract**

In `front/features/current-session/api/current-session-contracts.ts`, change the export line to:

```ts
export {
  CurrentSessionResponseSchema,
  parseCurrentSessionResponse,
} from "@/shared/model/current-session-contracts";
```

- [ ] **Step 5: Use the parser in the API client**

In `front/features/current-session/api/current-session-api.ts`, include `parseCurrentSessionResponse` in the imports and change `getCurrentSession(...)` to:

```ts
export async function getCurrentSession(context?: ReadmatesApiContext) {
  return readmatesFetch<CurrentSessionResponse>("/api/sessions/current", undefined, context).then(
    parseCurrentSessionResponse,
  );
}
```

- [ ] **Step 6: Verify the current-session parser**

Run:

```bash
pnpm --dir front test -- features/current-session/api/current-session-contracts.test.ts
```

Expected:

```text
PASS
```

## Task 4: Wire DEV Parser for Admin Analytics Overview

**Files:**
- Modify: `front/features/platform-admin/api/platform-admin-analytics-contracts.ts`
- Modify: `front/features/platform-admin/api/platform-admin-analytics-api.ts`
- Create: `front/features/platform-admin/api/platform-admin-analytics-contracts.test.ts`

- [ ] **Step 1: Create parser tests**

Create `front/features/platform-admin/api/platform-admin-analytics-contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

const validOverview = {
  schema: "admin.analytics_overview.v2",
  generatedAt: "2026-05-30T00:00:00Z",
  window: "30d",
  kpis: [
    {
      key: "SESSION_COMPLETION",
      unit: "PERCENT",
      availability: "AVAILABLE",
      current: 80,
      prior: 60,
      deltaDirection: "UP",
    },
  ],
  clubBenchmark: {
    availability: "AVAILABLE",
    rows: [
      {
        clubId: "club-1",
        slug: "reading-sai",
        name: "Reading Sai",
        activeMembers: 6,
        sessionCompletionRate: 83,
        rsvpRate: 75,
        aiCostUsd: "1.2500",
        notificationDeliveryRate: 96,
      },
    ],
  },
  series: [
    {
      key: "SESSION_COMPLETION",
      unit: "PERCENT",
      points: [{ bucketStart: "2026-05-01", availability: "AVAILABLE", value: 80 }],
    },
  ],
};

describe("platform-admin analytics zod parser", () => {
  it("parses a valid analytics overview", async () => {
    const { parseAdminAnalyticsOverview } = await import("./platform-admin-analytics-contracts");

    expect(parseAdminAnalyticsOverview(validOverview)).toMatchObject({
      schema: "admin.analytics_overview.v2",
      kpis: [{ key: "SESSION_COMPLETION" }],
    });
  });

  it("throws when a nested KPI field is missing", async () => {
    const { parseAdminAnalyticsOverview } = await import("./platform-admin-analytics-contracts");
    const invalid = {
      ...validOverview,
      kpis: [{ ...validOverview.kpis[0], deltaDirection: undefined }],
    };

    expect(() => parseAdminAnalyticsOverview(invalid)).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused frontend test and verify it fails**

Run:

```bash
pnpm --dir front test -- features/platform-admin/api/platform-admin-analytics-contracts.test.ts
```

Expected before implementation: FAIL because `parseAdminAnalyticsOverview` is not exported.

- [ ] **Step 3: Add the parser**

In `platform-admin-analytics-contracts.ts`, import the model type and add the parser:

```ts
import type { AdminAnalyticsOverview } from "@/features/platform-admin/model/platform-admin-analytics-model";
```

```ts
export function parseAdminAnalyticsOverview(value: unknown): AdminAnalyticsOverview {
  if (import.meta.env.DEV) {
    return AdminAnalyticsOverviewSchema.parse(value) as AdminAnalyticsOverview;
  }
  return value as AdminAnalyticsOverview;
}
```

- [ ] **Step 4: Use the parser in the API client**

In `front/features/platform-admin/api/platform-admin-analytics-api.ts`, add:

```ts
import { parseAdminAnalyticsOverview } from "@/features/platform-admin/api/platform-admin-analytics-contracts";
```

Change `fetchAdminAnalyticsOverview(...)` to:

```ts
export function fetchAdminAnalyticsOverview(window: AnalyticsWindow) {
  return readmatesFetch<AdminAnalyticsOverview>(
    `/api/admin/analytics/overview?${analyticsSearchFromWindow(window).toString()}`,
    undefined,
    { clubSlug: undefined },
  ).then(parseAdminAnalyticsOverview);
}
```

- [ ] **Step 5: Verify the analytics parser**

Run:

```bash
pnpm --dir front test -- features/platform-admin/api/platform-admin-analytics-contracts.test.ts
```

Expected:

```text
PASS
```

## Task 5: Update Release and Contract Documentation

**Files:**
- Modify: `docs/development/release-readiness-review.md`
- Modify: `docs/development/adr/0009-frontend-backend-contract-via-zod.md`
- Modify: `docs/development/test-guide.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the release-readiness repair note**

In `docs/development/release-readiness-review.md`, after the `2026-06-01 Analytics confidence residual closure note`, add:

```markdown
## 2026-06-02 Residual risk closure note

- Scope reviewed: `origin/main..HEAD`.
- Failure found before repair: `MySqlQueryPlanTest` failed because the notes feed union query selected a full `questions` scan (`accessType=ALL`, `key=null`) for the question branch.
- Repair evidence: the production notes feed question branch and matching EXPLAIN guard now pin the existing `questions_club_session_created_idx` indexed access strategy.
- Contract evidence: frontend/server contract confidence now compares recursive object key sets where representative fixture elements exist, and current-session/admin analytics DEV parsers are wired through their API clients.
- Executed: targeted `MySqlQueryPlanTest`, `FrontendZodSchemaContractTest`, `ServerQueryBudgetTest`, frontend parser/unit tests, frontend lint/test/build, focused visual E2E, `architectureTest`, `git diff --check`, public release candidate build/check.
- Skipped: no production OAuth, VM, or provider-console smoke was run in this remediation because the changed surface is local SQL/query-plan, contract validation, and docs.
- Residual risk: no known local release-readiness residual remains for the repaired branch. Production deploy/tag smoke remains a release-operation step, not evidence generated by this local remediation.
```

If not all listed commands have passed by the time this task runs, replace the `Executed` line with only the commands that actually passed. Do not claim skipped checks passed.

- [ ] **Step 2: Update ADR-0009 limitations**

In `docs/development/adr/0009-frontend-backend-contract-via-zod.md`, replace:

```markdown
- top-level key set만 비교하므로, 중첩 객체의 필드 변경은 현재 테스트에서 감지되지 않는다. `attendees[0].rsvpStatus` 필드가 제거되어도 `attendees` 키 자체가 있으면 테스트는 통과한다.
```

with:

```markdown
- 서버 contract test는 fixture에 대표 object 또는 array element가 있는 범위에서 recursive key set을 비교한다. fixture array가 비어 있으면 해당 array element의 nested shape는 검증할 수 없으므로, drift 위험이 큰 endpoint는 fixture에 public-safe 대표 element를 포함한다.
```

- [ ] **Step 3: Clarify test-guide server lanes**

In `docs/development/test-guide.md`, in the backend query-plan section, add:

````markdown
`./server/gradlew -p server clean test` may be a no-op for integration-tagged confidence checks. For release-risk review that touches SQL plans, API contracts, or query budgets, run the targeted integration lane explicitly:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.contract.FrontendZodSchemaContractTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```
````

- [ ] **Step 4: Update CHANGELOG**

Under `CHANGELOG.md` `## Unreleased`, add a concise bullet:

```markdown
- **release confidence:** notes feed query-plan confidence now closes the `questions` full-scan regression with an indexed SQL path and matching EXPLAIN guard; frontend/server contract confidence also checks nested fixture shapes and wires DEV parsers for current-session and admin analytics responses.
```

- [ ] **Step 5: Run docs whitespace check**

Run:

```bash
git diff --check -- docs/development/release-readiness-review.md docs/development/adr/0009-frontend-backend-contract-via-zod.md docs/development/test-guide.md CHANGELOG.md
```

Expected:

```text
no output
```

## Task 6: Run Full Closure Verification

**Files:**
- No source edits unless a verification failure identifies a concrete defect.

- [ ] **Step 1: Check branch and diff hygiene**

Run:

```bash
git status --short --branch
git diff --check origin/main..HEAD
```

Expected:

```text
## main...origin/main [ahead 23]
```

`git diff --check` should produce no output.

- [ ] **Step 2: Run frontend baseline checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected:

```text
lint exits 0
Test Files pass
vite build exits 0
```

- [ ] **Step 3: Run focused visual evidence E2E**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts tests/e2e/host-club-operations.spec.ts tests/e2e/member-reading-momentum.spec.ts
```

Expected:

```text
6 passed
```

- [ ] **Step 4: Run server contract/query confidence lane**

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.contract.FrontendZodSchemaContractTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```

Expected:

```text
BUILD SUCCESSFUL
```

- [ ] **Step 5: Run architecture boundary**

Run:

```bash
./server/gradlew -p server architectureTest
```

Expected:

```text
BUILD SUCCESSFUL
```

If Gradle reports `FROM-CACHE`, keep that wording in the final report.

- [ ] **Step 6: Run public release safety**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected:

```text
Public release candidate built
Public-release check passed
```

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short --branch
```

Expected:

```text
## main...origin/main [ahead 23]
```

If generated artifacts appear under ignored paths only, do not stage them. If tracked files changed unexpectedly, inspect before reporting completion.

## Task 7: Commit the Remediation

**Files:**
- Stage only files intentionally changed by Tasks 1-5.

- [ ] **Step 1: Inspect changed files**

Run:

```bash
git diff --name-only
git diff --stat
```

Expected changed files:

```text
CHANGELOG.md
docs/development/adr/0009-frontend-backend-contract-via-zod.md
docs/development/release-readiness-review.md
docs/development/test-guide.md
front/features/current-session/api/current-session-api.ts
front/features/current-session/api/current-session-contracts.test.ts
front/features/current-session/api/current-session-contracts.ts
front/features/platform-admin/api/platform-admin-analytics-api.ts
front/features/platform-admin/api/platform-admin-analytics-contracts.test.ts
front/features/platform-admin/api/platform-admin-analytics-contracts.ts
front/shared/model/current-session-contracts.ts
server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt
server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt
server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt
```

The exact list may include this spec and plan if they are committed with the remediation:

```text
docs/superpowers/specs/2026-06-02-readmates-residual-risk-closure-design.md
docs/superpowers/plans/2026-06-02-readmates-residual-risk-closure-implementation-plan.md
```

- [ ] **Step 2: Stage intentional files**

Run:

```bash
git add \
  CHANGELOG.md \
  docs/development/adr/0009-frontend-backend-contract-via-zod.md \
  docs/development/release-readiness-review.md \
  docs/development/test-guide.md \
  front/features/current-session/api/current-session-api.ts \
  front/features/current-session/api/current-session-contracts.test.ts \
  front/features/current-session/api/current-session-contracts.ts \
  front/features/platform-admin/api/platform-admin-analytics-api.ts \
  front/features/platform-admin/api/platform-admin-analytics-contracts.test.ts \
  front/features/platform-admin/api/platform-admin-analytics-contracts.ts \
  front/shared/model/current-session-contracts.ts \
  server/src/main/kotlin/com/readmates/note/adapter/out/persistence/JdbcNotesFeedAdapter.kt \
  server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt \
  server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt
```

Add the spec/plan docs too if the execution is meant to preserve planning artifacts in the commit:

```bash
git add \
  docs/superpowers/specs/2026-06-02-readmates-residual-risk-closure-design.md \
  docs/superpowers/plans/2026-06-02-readmates-residual-risk-closure-implementation-plan.md
```

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "fix: close readmates residual release risks"
```

Expected:

```text
[main <sha>] fix: close readmates residual release risks
```

## Self-Review

Spec coverage:

- P0 query-plan failure is covered by Task 1.
- Stale release-readiness evidence is covered by Task 5.
- Shallow nested contract confidence is covered by Task 2.
- Missing DEV parser wiring is covered by Tasks 3 and 4.
- Full validation and public safety are covered by Task 6.

Placeholder scan:

- Passed. Steps use concrete file paths, commands, expected outputs, and code snippets.

Type consistency:

- Parser names are `parseCurrentSessionResponse` and `parseAdminAnalyticsOverview` throughout.
- Server helper names are `assertJsonShapeMatches` and `assertObjectKeysMatch` throughout.

Execution note:

- Do not mark this plan complete while `MySqlQueryPlanTest` is failing.
- Do not claim `./server/gradlew -p server clean test` proves server behavior if Gradle reports `test SKIPPED`.
