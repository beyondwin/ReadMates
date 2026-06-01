# ReadMates Contract + Visual + Reading Momentum Umbrella Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved A/B/C umbrella: contract confidence, visual evidence baseline, and member reading momentum.

**Architecture:** Keep the existing route-first frontend and clean server boundaries. Contract work adds DEV-only frontend Zod schemas and server fixture tests; visual work adds route-scoped Playwright evidence; product work stays in shared/member model and route/UI tests without moving admin-only signals into member surfaces.

**Tech Stack:** React/Vite, React Router 7, TanStack Query, Zod, Vitest, Playwright, Kotlin/Spring Boot, MockMvc, MySQL/Testcontainers, Markdown docs.

---

## Scope Check

The approved spec covers three related but independently shippable slices. Execute them in order and commit after each one:

1. Contract confidence sweep.
2. Visual evidence baseline.
3. Member reading momentum.

Do not start Task 2 until Task 1 verification is green. Do not start Task 3 until Task 2 verification is green.

## File Structure

Expected file responsibilities:

- `front/features/platform-admin/api/platform-admin-analytics-contracts.ts`: DEV-only Zod schema for `/api/admin/analytics/overview`.
- `front/features/current-session/api/current-session-contracts.ts`: existing current-session types plus DEV-only Zod schema for `/api/sessions/current`.
- `front/scripts/export-zod-fixtures.ts`: writes generated sample fixtures for server contract tests.
- `front/tests/unit/__fixtures__/zod-schemas/admin-analytics-overview.json`: generated top-level analytics response fixture.
- `front/tests/unit/__fixtures__/zod-schemas/current-session.json`: generated top-level current-session response fixture.
- `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`: MockMvc contract checks against generated fixture key sets.
- `docs/development/architecture.md`: current behavior source of truth; remove stale `/admin/analytics` coming-soon claim.
- `docs/development/adr/0009-frontend-backend-contract-via-zod.md`: update coverage from host-only to host + admin analytics + current-session.
- `front/tests/e2e/admin-analytics.spec.ts`: keep current analytics visual evidence and add reusable safety assertions if needed.
- `front/tests/e2e/host-club-operations.spec.ts`: add desktop/mobile screenshot evidence for host dashboard operating signal.
- `front/tests/e2e/member-reading-momentum.spec.ts`: new route-mocked Playwright evidence for member current-session/home.
- `docs/development/test-guide.md`: document the visual evidence commands and artifacts.
- `docs/showcase/engineering-confidence.md`: list the new contract and visual guardrails.
- `docs/showcase/operational-proof.md`: connect the evidence flow to release readiness.
- `front/shared/model/reading-loop.ts`: add a role-safe next-action model if the tests show the current label/description API is too thin.
- `front/shared/model/reading-loop.test.ts`: pin next-action priority and role-safe behavior.
- `front/features/member-home/model/member-home-view-model.ts`: map reading-loop state to concrete member home actions.
- `front/features/member-home/model/member-home-view-model.test.ts`: test note/archive/feedback continuity.
- `front/features/current-session/model/current-session-view-model.ts`: map current-session reading state to more specific prep/reflection copy.
- `front/features/current-session/model/current-session-view-model.test.ts`: test current-session summary and restriction states.
- `front/tests/unit/frontend-boundaries.test.ts`: run unchanged to prove imports still respect route-first boundaries.
- `CHANGELOG.md`: add concise `Unreleased` notes for contract confidence, visual evidence, and reading momentum.

## Task 1: Contract Confidence Sweep

**Files:**
- Create: `front/features/platform-admin/api/platform-admin-analytics-contracts.ts`
- Modify: `front/features/current-session/api/current-session-contracts.ts`
- Modify: `front/scripts/export-zod-fixtures.ts`
- Generate: `front/tests/unit/__fixtures__/zod-schemas/admin-analytics-overview.json`
- Generate: `front/tests/unit/__fixtures__/zod-schemas/current-session.json`
- Modify: `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`
- Modify: `docs/development/architecture.md`
- Modify: `docs/development/adr/0009-frontend-backend-contract-via-zod.md`
- Modify: `docs/showcase/engineering-confidence.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the failing server contract tests**

Modify `server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt`.

Add imports:

```kotlin
import com.readmates.auth.application.service.AuthSessionService
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import java.util.UUID
```

Change the constructor to include `AuthSessionService`:

```kotlin
class FrontendZodSchemaContractTest
    @Autowired
    constructor(
        private val mockMvc: MockMvc,
        private val objectMapper: ObjectMapper,
        private val authSessionService: AuthSessionService,
    ) : ReadmatesMySqlIntegrationTestSupport() {
```

Add cleanup state near the existing `zodFixturesDir` property:

```kotlin
        private val createdSessionTokenHashes = linkedSetOf<String>()
```

Add cleanup and helper methods before `assertTopLevelKeySetMatches`:

```kotlin
        @AfterEach
        fun cleanupSessions() {
            if (createdSessionTokenHashes.isEmpty()) {
                return
            }

            val placeholders = createdSessionTokenHashes.joinToString(",") { "?" }
            jdbcTemplate.update(
                "delete from auth_sessions where session_token_hash in ($placeholders)",
                *createdSessionTokenHashes.toTypedArray(),
            )
            createdSessionTokenHashes.clear()
        }

        @Test
        fun `admin analytics overview response matches zod schema fixture key set`() {
            val response =
                mockMvc
                    .get("/api/admin/analytics/overview?window=30d") {
                        cookie(sessionCookieForUser(OWNER_USER_ID))
                    }.andExpect {
                        status { isOk() }
                    }.andReturn()
                    .response.contentAsString

            assertTopLevelKeySetMatches(response, "admin-analytics-overview.json")
        }

        @Test
        fun `current session response matches zod schema fixture key set`() {
            val response =
                mockMvc
                    .get("/api/sessions/current") {
                        cookie(sessionCookieForUser(MEMBER_USER_ID))
                    }.andExpect {
                        status { isOk() }
                    }.andReturn()
                    .response.contentAsString

            assertTopLevelKeySetMatches(response, "current-session.json")
        }

        private fun sessionCookieForUser(userId: String): Cookie {
            val issuedSession =
                authSessionService.issueSession(
                    userId = UUID.fromString(userId).toString(),
                    userAgent = "FrontendZodSchemaContractTest",
                    ipAddress = "127.0.0.1",
                )
            createdSessionTokenHashes += issuedSession.storedTokenHash
            return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
        }
```

Add constants to the companion object at the end of the class:

```kotlin
        private companion object {
            private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
            private const val MEMBER_USER_ID = "00000000-0000-0000-0000-000000000106"
        }
```

The helper uses `jdbcTemplate`, so add it to the constructor:

```kotlin
import org.springframework.jdbc.core.JdbcTemplate
```

```kotlin
        private val jdbcTemplate: JdbcTemplate,
```

- [ ] **Step 2: Run the server contract test and verify it fails**

Run:

```bash
./server/gradlew -p server integrationTest --tests "com.readmates.contract.FrontendZodSchemaContractTest"
```

Expected: FAIL because `admin-analytics-overview.json` and `current-session.json` do not exist yet.

- [ ] **Step 3: Create the admin analytics Zod contract**

Create `front/features/platform-admin/api/platform-admin-analytics-contracts.ts`:

```ts
import { z } from "zod";

export const AdminAnalyticsOverviewSchema = import.meta.env.DEV
  ? z.object({
      schema: z.literal("admin.analytics_overview.v2"),
      generatedAt: z.string(),
      window: z.enum(["7d", "30d", "90d"]),
      kpis: z.array(
        z.object({
          key: z.enum([
            "ACTIVE_MEMBERS",
            "SESSION_COMPLETION",
            "RSVP_RATE",
            "AI_COST_PER_SESSION",
            "NOTIFICATION_DELIVERY",
          ]),
          unit: z.enum(["COUNT", "PERCENT", "USD"]),
          availability: z.enum(["AVAILABLE", "NOT_ENOUGH_DATA", "MEASUREMENT_UNAVAILABLE"]),
          current: z.number().nullable(),
          prior: z.number().nullable(),
          deltaDirection: z.enum(["UP", "DOWN", "FLAT", "NONE"]),
        }),
      ),
      clubBenchmark: z.object({
        availability: z.enum(["AVAILABLE", "NOT_ENOUGH_DATA", "MEASUREMENT_UNAVAILABLE"]),
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
      }),
      series: z.array(
        z.object({
          key: z.enum([
            "ACTIVE_MEMBERS",
            "SESSION_COMPLETION",
            "RSVP_RATE",
            "AI_COST_PER_SESSION",
            "NOTIFICATION_DELIVERY",
          ]),
          unit: z.enum(["COUNT", "PERCENT", "USD"]),
          points: z.array(
            z.object({
              bucketStart: z.string(),
              availability: z.enum(["AVAILABLE", "NOT_ENOUGH_DATA", "MEASUREMENT_UNAVAILABLE"]),
              value: z.number().nullable(),
            }),
          ),
        }),
      ),
    })
  : (null as never);
```

- [ ] **Step 4: Add the current-session Zod contract**

Modify `front/features/current-session/api/current-session-contracts.ts`.

Add the import at the top:

```ts
import { z } from "zod";
```

Append this schema after the existing response/request types:

```ts
export const CurrentSessionResponseSchema = import.meta.env.DEV
  ? z.object({
      currentSession: z
        .object({
          sessionId: z.string(),
          sessionNumber: z.number(),
          title: z.string(),
          bookTitle: z.string(),
          bookAuthor: z.string(),
          bookLink: z.string().nullable(),
          bookImageUrl: z.string().nullable(),
          date: z.string(),
          startTime: z.string(),
          endTime: z.string(),
          locationLabel: z.string(),
          meetingUrl: z.string().nullable(),
          meetingPasscode: z.string().nullable(),
          questionDeadlineAt: z.string(),
          myRsvpStatus: z.enum(["NO_RESPONSE", "GOING", "MAYBE", "DECLINED"]),
          myCheckin: z
            .object({
              readingProgress: z.number(),
            })
            .nullable(),
          myQuestions: z.array(
            z.object({
              priority: z.number(),
              text: z.string(),
              draftThought: z.string().nullable(),
              authorName: z.string(),
              authorShortName: z.string(),
            }),
          ),
          myOneLineReview: z
            .object({
              text: z.string(),
            })
            .nullable(),
          myLongReview: z
            .object({
              body: z.string(),
            })
            .nullable(),
          board: z.object({
            questions: z.array(
              z.object({
                priority: z.number(),
                text: z.string(),
                draftThought: z.string().nullable(),
                authorName: z.string(),
                authorShortName: z.string(),
              }),
            ),
            longReviews: z.array(
              z.object({
                authorName: z.string(),
                authorShortName: z.string(),
                body: z.string(),
              }),
            ),
          }),
          attendees: z.array(
            z.object({
              membershipId: z.string(),
              displayName: z.string(),
              accountName: z.string(),
              role: z.enum(["HOST", "MEMBER"]),
              rsvpStatus: z.enum(["NO_RESPONSE", "GOING", "MAYBE", "DECLINED"]),
              attendanceStatus: z.enum(["UNKNOWN", "ATTENDED", "ABSENT"]),
              participationStatus: z.enum(["ACTIVE", "REMOVED"]).optional(),
            }),
          ),
        })
        .nullable(),
    })
  : (null as never);
```

- [ ] **Step 5: Export the new fixtures**

Modify `front/scripts/export-zod-fixtures.ts`.

Change the header comment to:

```ts
/**
 * Writes sample valid JSON fixture files representing the top-level key shapes
 * of zod-validated frontend API response schemas.
 *
 * Run via: pnpm zod:export-fixtures
 *
 * The fixtures are the source of truth for the server-side
 * FrontendZodSchemaContractTest, which verifies that server MockMvc responses
 * contain exactly the same top-level keys as these fixtures.
 */
```

Add these objects after `hostInvitationList`:

```ts
const adminAnalyticsOverview = {
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
        clubId: "00000000-0000-0000-0000-000000000001",
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

const currentSession = {
  currentSession: {
    sessionId: "00000000-0000-0000-0000-000000000301",
    sessionNumber: 1,
    title: "1회차 · 팩트풀니스",
    bookTitle: "팩트풀니스",
    bookAuthor: "한스 로슬링",
    bookLink: null,
    bookImageUrl: null,
    date: "2025-11-26",
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "온라인",
    meetingUrl: null,
    meetingPasscode: null,
    questionDeadlineAt: "2025-11-25T14:59:00Z",
    myRsvpStatus: "GOING",
    myCheckin: { readingProgress: 100 },
    myQuestions: [],
    myOneLineReview: null,
    myLongReview: null,
    board: {
      questions: [],
      longReviews: [],
    },
    attendees: [],
  },
};
```

Append the writes:

```ts
write("admin-analytics-overview.json", adminAnalyticsOverview);
write("current-session.json", currentSession);
```

- [ ] **Step 6: Generate fixtures and verify freshness**

Run:

```bash
pnpm --dir front zod:export-fixtures
git diff -- front/tests/unit/__fixtures__/zod-schemas/
```

Expected: two new fixture files appear with the exact top-level keys `schema`, `generatedAt`, `window`, `kpis`, `clubBenchmark`, `series` and `currentSession`.

- [ ] **Step 7: Run frontend contract-related checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front build
```

Expected: PASS. This catches TypeScript, lint, and production build issues from the new exported schema files.

- [ ] **Step 8: Run the server contract test and verify it passes**

Run:

```bash
./server/gradlew -p server integrationTest --tests "com.readmates.contract.FrontendZodSchemaContractTest"
```

Expected: BUILD SUCCESSFUL with all `FrontendZodSchemaContractTest` tests passing.

- [ ] **Step 9: Update source-of-truth docs**

Modify `docs/development/architecture.md`.

Find the platform-admin row that currently says `/admin/analytics` is a coming-soon placeholder. Replace that sentence with:

```markdown
`/admin/analytics`는 활성 멤버, 세션 완료율, RSVP 응답률, AI 비용/세션, 알림 도달률을 7/30/90일 window와 series/benchmark로 보여주는 aggregate-only 운영 분석 표면입니다.
```

Modify `docs/development/adr/0009-frontend-backend-contract-via-zod.md`.

Replace the old "현재 fixture 목록" block with:

```markdown
현재 fixture 목록:

- `front/tests/unit/__fixtures__/zod-schemas/host-invitation-list.json`
- `front/tests/unit/__fixtures__/zod-schemas/host-notification-delivery-list.json`
- `front/tests/unit/__fixtures__/zod-schemas/host-session-detail.json`
- `front/tests/unit/__fixtures__/zod-schemas/admin-analytics-overview.json`
- `front/tests/unit/__fixtures__/zod-schemas/current-session.json`
```

Replace the old residual-risk sentence that says host feature 3개만 커버됨 with:

```markdown
현재 fixture는 host session/notification/invitation, admin analytics overview, member current-session의 top-level response contract를 커버합니다. 모든 endpoint를 커버하지는 않으므로 신규 API contract를 추가할 때 fixture 후보에 포함할지 검토합니다.
```

Modify `docs/showcase/engineering-confidence.md`.

Add a row under `Boundary Evidence`:

```markdown
| Frontend/server response contracts | `pnpm --dir front zod:export-fixtures`, `FrontendZodSchemaContractTest` | frontend schema와 server MockMvc response의 top-level contract drift |
```

Modify `CHANGELOG.md`.

Under `## Unreleased` / `### Highlights`, add:

```markdown
- **contract confidence:** frontend Zod fixture와 server MockMvc contract test 범위를 host-only에서 admin analytics와 member current-session까지 넓혀, 운영 분석과 멤버 읽기 루프의 response shape drift를 더 빨리 잡습니다.
```

- [ ] **Step 10: Run Task 1 verification**

Run:

```bash
pnpm --dir front zod:export-fixtures
git diff --exit-code front/tests/unit/__fixtures__/zod-schemas/
pnpm --dir front test
./server/gradlew -p server integrationTest --tests "com.readmates.contract.FrontendZodSchemaContractTest"
git diff --check -- docs/development/architecture.md docs/development/adr/0009-frontend-backend-contract-via-zod.md docs/showcase/engineering-confidence.md CHANGELOG.md
```

Expected: all commands pass. The fixture freshness command should exit 0 after generated files are committed or already current.

- [ ] **Step 11: Commit Task 1**

Run:

```bash
git status --short
git add front/features/platform-admin/api/platform-admin-analytics-contracts.ts front/features/current-session/api/current-session-contracts.ts front/scripts/export-zod-fixtures.ts front/tests/unit/__fixtures__/zod-schemas/admin-analytics-overview.json front/tests/unit/__fixtures__/zod-schemas/current-session.json server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt docs/development/architecture.md docs/development/adr/0009-frontend-backend-contract-via-zod.md docs/showcase/engineering-confidence.md CHANGELOG.md
git commit -m "test: expand frontend server contract confidence"
```

Expected: a focused contract-confidence commit.

## Task 2: Visual Evidence Baseline

**Files:**
- Modify: `front/tests/e2e/admin-analytics.spec.ts`
- Modify: `front/tests/e2e/host-club-operations.spec.ts`
- Create: `front/tests/e2e/member-reading-momentum.spec.ts`
- Modify: `docs/development/test-guide.md`
- Modify: `docs/showcase/engineering-confidence.md`
- Modify: `docs/showcase/operational-proof.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Extract reusable private-data sentinels in admin analytics E2E**

Modify `front/tests/e2e/admin-analytics.spec.ts`.

Add this helper after `routeAnalytics`:

```ts
async function expectNoPrivateSentinels(page: Page): Promise<void> {
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}
```

Replace the final sentinel assertions in both analytics tests with:

```ts
await expectNoPrivateSentinels(page);
```

- [ ] **Step 2: Run the focused analytics E2E and verify it still passes**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts
```

Expected: PASS, with `admin-analytics-desktop.png` and `admin-analytics-mobile.png` generated under Playwright test output.

- [ ] **Step 3: Add host dashboard visual evidence**

Modify `front/tests/e2e/host-club-operations.spec.ts`.

Change the first import:

```ts
import { expect, test } from "@playwright/test";
```

to:

```ts
import { expect, test, type Page } from "@playwright/test";
```

Add this helper after `test.afterEach`:

```ts
async function expectHostDashboardPublicSafe(page: Page): Promise<void> {
  const card = page.getByRole("region", { name: "운영 신호" });
  await expect(card).toBeVisible();
  await expect(card.getByText(/READY/)).toBeVisible();
  await expect(card.getByText(/AI 실패/)).toBeVisible();
  await expect(card.getByText("@example.com")).toHaveCount(0);
  await expect(card.getByText("ADMIN_ROUTE")).toHaveCount(0);
  await expect(card.getByText("private.example.com")).toHaveCount(0);
}
```

Replace the existing card assertions in `host dashboard renders read-only operating-signal card without leaking admin-only signals` with:

```ts
await expectHostDashboardPublicSafe(page);
```

Add a second test:

```ts
test("host dashboard captures public-safe operating-signal visual evidence", async ({ page }, testInfo) => {
  await loginWithGoogleFixture(page, "host@example.com");

  await page.route("**/api/bff/api/host/club-operations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema: "host.club_operations_snapshot.v1",
        generatedAt: "2026-05-31T00:00:00Z",
        club: { clubId: "club-1", slug: "club-one", name: "Club One" },
        readiness: { state: "READY", blockingReasons: [], nextAction: null },
        sessionProgress: {
          upcomingCount: 1,
          currentOpenCount: 1,
          closedCount: 4,
          publishedRecordCount: 3,
          incompleteRecordCount: 1,
        },
        aiUsage: {
          activeJobs: 1,
          failedRecentJobs: 3,
          staleCandidates: 0,
          costEstimateUsd: "0.5000",
          state: "DEGRADED",
          priorFailedJobs7d: 1,
        },
      }),
    });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/host");
  await expectHostDashboardPublicSafe(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("host-dashboard-operating-signal-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/host");
  await expectHostDashboardPublicSafe(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("host-dashboard-operating-signal-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);
});
```

- [ ] **Step 4: Run host visual evidence**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/host-club-operations.spec.ts
```

Expected: PASS, with desktop/mobile host dashboard screenshot artifacts generated.

- [ ] **Step 5: Create member reading momentum visual evidence spec**

Create `front/tests/e2e/member-reading-momentum.spec.ts`:

```ts
import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

const memberAuth: AuthMeResponse = {
  authenticated: true,
  userId: "member-user",
  membershipId: "member-membership",
  clubId: "club-one",
  email: "member@example.com",
  displayName: "멤버",
  accountName: "이멤버5",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
  currentMembership: {
    clubId: "club-one",
    clubName: "Club One",
    clubSlug: "club-one",
    role: "MEMBER",
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
  },
  joinedClubs: [],
  platformAdmin: null,
  recommendedAppEntryUrl: "/app",
};

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeMemberShell(page: Page): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, memberAuth);
  });
}

async function routeCurrentSession(page: Page): Promise<void> {
  await page.route("**/api/bff/api/sessions/current", async (route) => {
    await json(route, 200, {
      currentSession: {
        sessionId: "session-7",
        sessionNumber: 7,
        title: "7회차 모임 · 테스트 책",
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
        myRsvpStatus: "NO_RESPONSE",
        myCheckin: null,
        myQuestions: [],
        myOneLineReview: null,
        myLongReview: null,
        board: { questions: [], longReviews: [] },
        attendees: [],
      },
    });
  });
}

async function routeMemberHomeFeeds(page: Page): Promise<void> {
  await page.route("**/api/bff/api/notes/feed**", async (route) => {
    await json(route, 200, {
      items: [
        {
          sessionId: "session-6",
          sessionNumber: 6,
          bookTitle: "지난 책",
          date: "2026-04-15",
          authorName: "이멤버5",
          authorShortName: "멤버5",
          kind: "ONE_LINE_REVIEW",
          text: "지난 세션 기록입니다.",
        },
      ],
      nextCursor: null,
    });
  });
  await page.route("**/api/bff/api/sessions/upcoming", async (route) => {
    await json(route, 200, []);
  });
}

async function expectNoMemberPrivateSentinels(page: Page): Promise<void> {
  await expect(page.getByText("private.example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
}

test("member current-session captures reading prep visual evidence", async ({ page }, testInfo) => {
  await routeMemberShell(page);
  await routeCurrentSession(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/session/current");
  await expect(page.getByText("멤버 준비 필요")).toBeVisible();
  await expect(page.getByText("RSVP, 읽기 진행률, 질문을 모임 전에 정리합니다.")).toBeVisible();
  await expectNoMemberPrivateSentinels(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("member-current-session-reading-prep-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/session/current");
  await expect(page.getByText("멤버 준비 필요")).toBeVisible();
  await expect(page.getByRole("button", { name: /참석/ })).toBeVisible();
  await expectNoMemberPrivateSentinels(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("member-current-session-reading-prep-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);
});

test("member home captures notes continuity visual evidence", async ({ page }, testInfo) => {
  await routeMemberShell(page);
  await routeCurrentSession(page);
  await routeMemberHomeFeeds(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/clubs/club-one/app");
  await expect(page.getByText("오늘 할 일")).toBeVisible();
  await expect(page.getByRole("link", { name: /RSVP/ })).toHaveAttribute("href", "/app/session/current");
  await expect(page.getByText("지난 세션 기록입니다.")).toBeVisible();
  await expectNoMemberPrivateSentinels(page);
  const desktopScreenshot = await page.screenshot({
    path: testInfo.outputPath("member-home-reading-momentum-desktop.png"),
    fullPage: true,
  });
  expect(desktopScreenshot.byteLength).toBeGreaterThan(10_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/clubs/club-one/app");
  await expect(page.getByText("오늘 할 일")).toBeVisible();
  await expect(page.getByRole("link", { name: /RSVP/ })).toBeVisible();
  await expectNoMemberPrivateSentinels(page);
  const mobileScreenshot = await page.screenshot({
    path: testInfo.outputPath("member-home-reading-momentum-mobile.png"),
    fullPage: true,
  });
  expect(mobileScreenshot.byteLength).toBeGreaterThan(10_000);
});
```

- [ ] **Step 6: Run the new member visual evidence and verify expected behavior**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/member-reading-momentum.spec.ts
```

Expected: PASS. If the current UI copy differs, update the expectation only after confirming it still expresses the same member action and does not expose admin-only/private sentinels.

- [ ] **Step 7: Update visual evidence docs**

Modify `docs/development/test-guide.md`.

After the existing `Admin analytics visual evidence` block, add:

````markdown
Host/member visual evidence:

```bash
pnpm --dir front test:e2e -- tests/e2e/host-club-operations.spec.ts
pnpm --dir front test:e2e -- tests/e2e/member-reading-momentum.spec.ts
```

These specs capture desktop and mobile screenshots into Playwright `test-results` using public-safe route mocks or dev fixtures. Generated screenshots are evidence artifacts only and are not committed.
````

Modify `docs/showcase/engineering-confidence.md`.

Update the `Admin analytics visual evidence` row to:

```markdown
| Admin/host/member visual evidence | `front/tests/e2e/admin-analytics.spec.ts`, `front/tests/e2e/host-club-operations.spec.ts`, `front/tests/e2e/member-reading-momentum.spec.ts` | desktop/mobile layout drift and private-data leakage in mocked operating and reading views |
```

Modify `docs/showcase/operational-proof.md`.

Add this paragraph under `Product Loop Evidence`:

```markdown
The host/member loop also has desktop/mobile screenshot evidence for host operating signals and member reading-prep states. Screenshots are generated from public-safe route mocks or dev fixtures and stay in Playwright output, not in the repository.
```

Modify `CHANGELOG.md`.

Under `## Unreleased` / `### Highlights`, add:

```markdown
- **visual evidence baseline:** analytics screenshot evidence now has matching host dashboard and member reading momentum E2E evidence, with desktop/mobile artifacts and public-safe leak sentinels.
```

- [ ] **Step 8: Run Task 2 verification**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts
pnpm --dir front test:e2e -- tests/e2e/host-club-operations.spec.ts
pnpm --dir front test:e2e -- tests/e2e/member-reading-momentum.spec.ts
pnpm --dir front test
git diff --check -- docs/development/test-guide.md docs/showcase/engineering-confidence.md docs/showcase/operational-proof.md CHANGELOG.md
```

Expected: all commands pass. Generated screenshots remain under Playwright output and are not staged.

- [ ] **Step 9: Commit Task 2**

Run:

```bash
git status --short
git add front/tests/e2e/admin-analytics.spec.ts front/tests/e2e/host-club-operations.spec.ts front/tests/e2e/member-reading-momentum.spec.ts docs/development/test-guide.md docs/showcase/engineering-confidence.md docs/showcase/operational-proof.md CHANGELOG.md
git commit -m "test: add host member visual evidence baseline"
```

Expected: a focused visual-evidence commit. If `git status --short` shows Playwright screenshots, do not add them.

## Task 3: Member Reading Momentum

**Files:**
- Modify: `front/shared/model/reading-loop.ts`
- Modify: `front/shared/model/reading-loop.test.ts`
- Modify: `front/features/member-home/model/member-home-view-model.ts`
- Modify: `front/features/member-home/model/member-home-view-model.test.ts`
- Modify: `front/features/current-session/model/current-session-view-model.ts`
- Modify: `front/features/current-session/model/current-session-view-model.test.ts`
- Modify: `front/tests/unit/member-home.test.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`
- Modify: `front/tests/unit/frontend-boundaries.test.ts` only if a new boundary assertion is needed; otherwise run it unchanged.
- Modify: `docs/showcase/guest-mode-walkthrough.md`
- Modify: `docs/showcase/operational-proof.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write failing shared-model tests for explicit next actions**

Modify `front/shared/model/reading-loop.test.ts`.

Add imports:

```ts
  getReadingLoopNextAction,
  type ReadingLoopActionTarget,
```

Add this test:

```ts
  it("derives role-safe member next actions without admin-only targets", () => {
    expect(
      getReadingLoopNextAction({
        state: "MEMBER_PREP_REQUIRED",
        missing: "RSVP",
      }),
    ).toEqual({
      label: "RSVP 하기",
      href: "/app/session/current",
      target: "current-session" satisfies ReadingLoopActionTarget,
    });

    expect(
      getReadingLoopNextAction({
        state: "REFLECTION_DUE",
        missing: "REFLECTION",
      }),
    ).toEqual({
      label: "회고 남기기",
      href: "/app/session/current",
      target: "current-session",
    });

    expect(
      getReadingLoopNextAction({
        state: "ARCHIVE_AVAILABLE",
        missing: "ARCHIVE",
      }),
    ).toEqual({
      label: "노트 보기",
      href: "/app/notes",
      target: "notes",
    });
  });
```

- [ ] **Step 2: Run shared-model test and verify it fails**

Run:

```bash
pnpm --dir front exec vitest run shared/model/reading-loop.test.ts
```

Expected: FAIL with `getReadingLoopNextAction` not exported.

- [ ] **Step 3: Implement the shared next-action helper**

Modify `front/shared/model/reading-loop.ts`.

Add these types after `ReadingLoopInput`:

```ts
export type ReadingLoopMissingWork =
  | "NONE"
  | "RSVP"
  | "CHECKIN"
  | "QUESTION"
  | "REFLECTION"
  | "ARCHIVE";

export type ReadingLoopActionTarget = "current-session" | "notes" | "archive" | "none";

export type ReadingLoopNextActionInput = {
  state: ReadingLoopState;
  missing: ReadingLoopMissingWork;
};

export type ReadingLoopNextAction = {
  label: string | null;
  href: string | null;
  target: ReadingLoopActionTarget;
};
```

Add this function before `isAfterSessionDate`:

```ts
export function getReadingLoopNextAction(input: ReadingLoopNextActionInput): ReadingLoopNextAction {
  if (input.state === "NO_SESSION" || input.state === "HOST_SETUP_REQUIRED") {
    return { label: null, href: null, target: "none" };
  }

  if (input.state === "MEMBER_PREP_REQUIRED") {
    switch (input.missing) {
      case "RSVP":
        return { label: "RSVP 하기", href: "/app/session/current", target: "current-session" };
      case "CHECKIN":
        return { label: "진행률 남기기", href: "/app/session/current", target: "current-session" };
      case "QUESTION":
        return { label: "질문 쓰기", href: "/app/session/current", target: "current-session" };
      case "NONE":
      case "REFLECTION":
      case "ARCHIVE":
        return { label: "세션 열기", href: "/app/session/current", target: "current-session" };
    }
  }

  if (input.state === "REFLECTION_DUE") {
    return { label: "회고 남기기", href: "/app/session/current", target: "current-session" };
  }

  if (input.state === "ARCHIVE_AVAILABLE") {
    return { label: "노트 보기", href: "/app/notes", target: "notes" };
  }

  return { label: "세션 열기", href: "/app/session/current", target: "current-session" };
}
```

- [ ] **Step 4: Run shared-model test and verify it passes**

Run:

```bash
pnpm --dir front exec vitest run shared/model/reading-loop.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing member-home model tests for archive and feedback continuity**

Modify `front/features/member-home/model/member-home-view-model.test.ts`.

Add this test:

```ts
  it("moves prepared members from current session to notes before generic ready copy", () => {
    expect(
      getMemberHomeNextReadingAction({
        session: {
          ...session,
          myOneLineReview: { text: "짧은 회고입니다." },
          myLongReview: { body: "긴 회고입니다." },
        },
        isViewer: false,
        canWrite: true,
        noteFeedItems,
        today: new Date(2026, 4, 21),
      }),
    ).toMatchObject({
      state: "ARCHIVE_AVAILABLE",
      message: "최근 보존된 기록을 이어 읽을 수 있어요.",
      href: "/app/notes",
      ctaLabel: "노트 보기",
    });
  });
```

Add this test:

```ts
  it("points post-session members at reflection before notes when reflection is missing", () => {
    expect(
      getMemberHomeNextReadingAction({
        session: {
          ...session,
          myOneLineReview: null,
          myLongReview: null,
        },
        isViewer: false,
        canWrite: true,
        noteFeedItems,
        today: new Date(2026, 4, 21),
      }),
    ).toMatchObject({
      state: "REFLECTION_DUE",
      message: "모임 후 한줄평이나 서평을 남겨 주세요.",
      href: "/app/session/current",
      ctaLabel: "회고 남기기",
    });
  });
```

- [ ] **Step 6: Run member-home model tests and verify current behavior**

Run:

```bash
pnpm --dir front exec vitest run features/member-home/model/member-home-view-model.test.ts
```

Expected: The second test may fail if archive availability currently outranks reflection due in `deriveReadingLoopState`. Keep the failure if it shows `ARCHIVE_AVAILABLE` where `REFLECTION_DUE` is expected.

- [ ] **Step 7: Adjust reading-loop priority so reflection beats archive**

Modify `front/shared/model/reading-loop.ts`.

Ensure the existing order stays:

```ts
  if (isAfterSessionDate(input.sessionDate, input.today ?? new Date()) && input.memberHasReflection === false) {
    return "REFLECTION_DUE";
  }

  if ((input.archiveItemCount ?? 0) > 0) {
    return "ARCHIVE_AVAILABLE";
  }
```

If this order is already present, do not change it. Fix the member-home input instead so `memberHasReflection` is false when both reviews are missing:

```ts
    memberHasReflection: session ? session.myOneLineReview !== null || session.myLongReview !== null : undefined,
```

Keep archive continuity only after reflection exists.

- [ ] **Step 8: Make member-home use the shared action helper**

Modify `front/features/member-home/model/member-home-view-model.ts`.

Change the import:

```ts
import {
  READING_LOOP_LABELS,
  deriveReadingLoopState,
  getReadingLoopNextAction,
  type ReadingLoopMissingWork,
  type ReadingLoopState,
} from "@/shared/model/reading-loop";
```

Add this helper before `getMemberHomeNextReadingAction`:

```ts
function missingWorkForMemberHome(session: NonNullable<MemberHomeCurrentSessionView["currentSession"]>): ReadingLoopMissingWork {
  if (session.myRsvpStatus === "NO_RESPONSE") {
    return "RSVP";
  }

  if (!session.myCheckin) {
    return "CHECKIN";
  }

  if (session.myQuestions.length < 2) {
    return "QUESTION";
  }

  if (!session.myOneLineReview && !session.myLongReview) {
    return "REFLECTION";
  }

  return "ARCHIVE";
}
```

In the `MEMBER_PREP_REQUIRED`, `REFLECTION_DUE`, `ARCHIVE_AVAILABLE`, and final ready branches, use `getReadingLoopNextAction` for `href` and `ctaLabel`. Example for RSVP:

```ts
    const action = getReadingLoopNextAction({ state, missing: "RSVP" });
    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: "RSVP를 먼저 선택해 주세요.",
      href: action.href,
      ctaLabel: action.label,
    };
```

Example for reflection:

```ts
  if (state === "REFLECTION_DUE") {
    const action = getReadingLoopNextAction({ state, missing: "REFLECTION" });
    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: "모임 후 한줄평이나 서평을 남겨 주세요.",
      href: action.href,
      ctaLabel: action.label,
    };
  }
```

Example for archive:

```ts
  if (state === "ARCHIVE_AVAILABLE") {
    const action = getReadingLoopNextAction({ state, missing: "ARCHIVE" });
    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: "최근 보존된 기록을 이어 읽을 수 있어요.",
      href: action.href,
      ctaLabel: action.label,
    };
  }
```

- [ ] **Step 9: Improve current-session summary specificity**

Modify `front/features/current-session/model/current-session-view-model.test.ts`.

Add:

```ts
  it("names the first missing current-session action for active members", () => {
    expect(
      getCurrentSessionReadingLoopSummary({
        rsvp: "NO_RESPONSE",
        readingProgress: 0,
        writtenQuestionCount: 0,
        oneLineReview: "",
        longReview: "",
        canWrite: true,
        sessionDate: "2026-06-04",
        today: new Date(2026, 4, 31),
      }).body,
    ).toBe("RSVP를 먼저 선택하고, 읽기 진행률과 질문을 이어서 정리합니다.");
  });
```

Modify `front/features/current-session/model/current-session-view-model.ts`.

In `getCurrentSessionReadingLoopSummary`, replace the `MEMBER_PREP_REQUIRED` body with first-missing-action copy:

```ts
  if (state === "MEMBER_PREP_REQUIRED") {
    if (input.rsvp === "NO_RESPONSE") {
      return {
        state,
        label: READING_LOOP_LABELS[state],
        body: "RSVP를 먼저 선택하고, 읽기 진행률과 질문을 이어서 정리합니다.",
      };
    }

    if (input.readingProgress <= 0) {
      return {
        state,
        label: READING_LOOP_LABELS[state],
        body: "읽기 진행률을 남긴 뒤 질문을 정리합니다.",
      };
    }

    return {
      state,
      label: READING_LOOP_LABELS[state],
      body: "질문을 모임 전에 정리합니다.",
    };
  }
```

Update the existing test expectation from:

```ts
body: "RSVP, 읽기 진행률, 질문을 모임 전에 정리합니다.",
```

to:

```ts
body: "RSVP를 먼저 선택하고, 읽기 진행률과 질문을 이어서 정리합니다.",
```

- [ ] **Step 10: Run member model tests**

Run:

```bash
pnpm --dir front exec vitest run shared/model/reading-loop.test.ts features/member-home/model/member-home-view-model.test.ts features/current-session/model/current-session-view-model.test.ts
```

Expected: PASS.

- [ ] **Step 11: Update route/UI tests for visible copy and links**

Modify `front/tests/unit/member-home.test.tsx`.

In `renders the mobile-first member home flow with real action links`, add assertions after `expect(mobileView.getByText("오늘 할 일")).toBeInTheDocument();`:

```ts
    expect(mobileView.getByText("RSVP를 먼저 선택해 주세요.")).toBeInTheDocument();
    expect(mobileView.getByRole("link", { name: /RSVP/ })).toHaveAttribute("href", "/app/session/current");
```

Modify `front/tests/unit/current-session.test.tsx`.

In the route render test that asserts the current session page content, add:

```ts
    expect(screen.getByText("RSVP를 먼저 선택하고, 읽기 진행률과 질문을 이어서 정리합니다.")).toBeInTheDocument();
```

If the route render test uses scoped desktop/mobile containers, assert within the desktop container first and mobile container second to avoid duplicate text ambiguity:

```ts
    expect(within(getDesktop(container)).getByText("RSVP를 먼저 선택하고, 읽기 진행률과 질문을 이어서 정리합니다.")).toBeInTheDocument();
```

- [ ] **Step 12: Run route/UI and boundary tests**

Run:

```bash
pnpm --dir front exec vitest run tests/unit/member-home.test.tsx tests/unit/current-session.test.tsx tests/unit/frontend-boundaries.test.ts
```

Expected: PASS. Boundary test should remain unchanged unless the implementation introduced a new import violation.

- [ ] **Step 13: Update showcase docs and changelog**

Modify `docs/showcase/guest-mode-walkthrough.md`.

Add this under the host/member private workflow section:

```markdown
Member reading momentum remains private by permission. Public reviewers verify it through `front/shared/model/reading-loop.test.ts`, member home/current-session unit tests, and `front/tests/e2e/member-reading-momentum.spec.ts` rather than opening member routes to guests.
```

Modify `docs/showcase/operational-proof.md`.

In `Product Loop Evidence`, replace the loop with:

```text
Host operating action
  -> role-safe reading-loop state
  -> member next reading action
  -> current-session / notes / archive / feedback continuity
  -> focused unit/route/E2E checks
  -> showcase and changelog update
  -> public release candidate scan when public-facing docs change
```

Modify `CHANGELOG.md`.

Under `## Unreleased` / `### Highlights`, add:

```markdown
- **member reading momentum:** member home/current-session now name the next reading or reflection action more directly and keep notes/archive continuity role-safe through the shared reading-loop model.
```

- [ ] **Step 14: Run Task 3 verification**

Run:

```bash
pnpm --dir front exec vitest run shared/model/reading-loop.test.ts features/member-home/model/member-home-view-model.test.ts features/current-session/model/current-session-view-model.test.ts tests/unit/member-home.test.tsx tests/unit/current-session.test.tsx tests/unit/frontend-boundaries.test.ts
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/member-reading-momentum.spec.ts
git diff --check -- docs/showcase/guest-mode-walkthrough.md docs/showcase/operational-proof.md CHANGELOG.md
```

Expected: all commands pass.

- [ ] **Step 15: Run public release safety check for changed public docs**

Run:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: public release candidate builds and scanner passes. If the scanner reports a finding in newly changed docs, fix the doc text rather than weakening scanner rules.

- [ ] **Step 16: Commit Task 3**

Run:

```bash
git status --short
git add front/shared/model/reading-loop.ts front/shared/model/reading-loop.test.ts front/features/member-home/model/member-home-view-model.ts front/features/member-home/model/member-home-view-model.test.ts front/features/current-session/model/current-session-view-model.ts front/features/current-session/model/current-session-view-model.test.ts front/tests/unit/member-home.test.tsx front/tests/unit/current-session.test.tsx docs/showcase/guest-mode-walkthrough.md docs/showcase/operational-proof.md CHANGELOG.md
git commit -m "feat: sharpen member reading momentum"
```

Expected: a focused member-product commit.

## Final Verification

After all three tasks are committed, run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
pnpm --dir front test:e2e -- tests/e2e/admin-analytics.spec.ts
pnpm --dir front test:e2e -- tests/e2e/host-club-operations.spec.ts
pnpm --dir front test:e2e -- tests/e2e/member-reading-momentum.spec.ts
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
git status --short
```

Expected:

- Frontend lint/test/build pass.
- Server clean test passes.
- Three targeted E2E specs pass.
- Public release candidate scanner passes.
- Working tree is clean except for intentionally untracked local artifacts ignored by git.

## Plan Self-Review

Spec coverage:

- A contract confidence is covered by Task 1: Zod schemas, fixture export, server MockMvc contract tests, docs drift cleanup, changelog.
- B visual evidence is covered by Task 2: analytics helper, host dashboard screenshots, member route screenshots, docs/showcase update.
- C member reading momentum is covered by Task 3: shared reading-loop next action, member-home/current-session model and UI tests, showcase/changelog.
- Public safety is covered by E2E sentinel assertions and public release candidate checks.
- Architecture boundaries are covered by route-first file placement and `frontend-boundaries.test.ts`.

Placeholder scan:

- No task uses vague implementation steps. Each code step names exact files and code snippets.
- No task asks for a broad rewrite.
- Each task has exact commands and expected outcomes.

Type consistency:

- `ReadingLoopMissingWork`, `ReadingLoopActionTarget`, `getReadingLoopNextAction`, and `ReadingLoopNextAction` are defined before use.
- Fixture filenames in frontend export and server tests match: `admin-analytics-overview.json`, `current-session.json`.
- E2E screenshot filenames match the docs wording and are not committed.
