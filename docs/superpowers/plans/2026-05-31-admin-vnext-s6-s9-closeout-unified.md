# Admin vNext S6→S9 Closeout 통합 Implementation Plan (C+D+E 단일)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** S6→S9 closeout의 남은 세 슬라이스를 단일 plan으로 닫는다 — Phase C(표면 연결성, `/admin/audit` AI 행 → ai-ops 드릴다운), Phase D(host-surface 보강, 중립 club-ops 계약 분리 + host read-only 재사용), Phase E(release-readiness 리뷰 리포트).

**Architecture:** Phase C는 순수 프런트 글루(서버 변경 0). Phase D는 admin·host가 공유하는 중립 계약을 `front/shared/model/club-operations.ts`로 분리하고, 서버는 기존 `AdminClubOperationsSnapshotPort`를 재사용해 host-scoped projection을 반환하는 `/api/host/club-operations` 엔드포인트를 추가한다. Phase E는 빌드가 아니라 `origin/main..HEAD` 누적분에 대한 release-readiness 리뷰 리포트다. **Phase 순서 C → D → E는 강제다**: 각 Phase의 minimum checks를 통과한 뒤에만 다음 Phase로 넘어간다(스펙 §1.1 — Phase 경계 = revert 지점).

**Tech Stack:** React + react-router-dom + TypeScript + Vitest(@testing-library/react) + Playwright(프런트), Kotlin/Spring Boot + JUnit5(서버). 프런트 패키지 루트 `front/`. `@/*` alias는 `front/` 루트.

**Spec:** `docs/superpowers/specs/2026-05-31-admin-vnext-s6-s9-closeout-unified-design.md`

**검증 명령 (작업 디렉토리 = repo 루트):**
- 프런트 단위(파일 단위): `pnpm --dir front test <path>`
- 프런트 린트/빌드: `pnpm --dir front lint` / `pnpm --dir front build`
- 프런트 e2e(파일 단위): `pnpm --dir front test:e2e <spec-file>`
- 서버 단위/경계: `./server/gradlew -p server test`, `./server/gradlew -p server architectureTest`

---

# PHASE C — 표면 연결성 (S6-T4)

> 기존 Slice C plan(`docs/superpowers/plans/2026-05-31-admin-s6-t4-aiops-surface-connectivity.md`)의 검증된 task를 흡수한다. 순수 프런트 글루 — 서버 계약 변경 없음. errorCode 딥링크는 audit 행이 안정적으로 노출하지 않으므로 **clubId 기준 링크만** 만든다(스코프 크리프 방지).

## Task 1: ai-ops outbound 경로 빌더 `aiOpsPathFromFilter`

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-ai-ops-model.ts`
- Test: `front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`platform-admin-ai-ops-model.test.ts` 의 import 목록에 `aiOpsPathFromFilter` 를 추가하고 파일 끝에 describe 블록을 추가한다.

import 블록(기존 import 정렬에 맞춰 `aiOpsPathFromFilter` 삽입):
```ts
import {
  AI_OPS_DEFAULT_WINDOW,
  EMPTY_AI_OPS_FILTER,
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  aiOpsPathFromFilter,
  aiOpsSearchFromFilter,
  aiOpsWindowFromSearchParams,
  hasActiveAiOpsFilter,
} from "./platform-admin-ai-ops-model";
```

파일 끝에 추가:
```ts
describe("aiOpsPathFromFilter", () => {
  it("returns the bare ai-ops path when no filter is active", () => {
    expect(aiOpsPathFromFilter(EMPTY_AI_OPS_FILTER)).toBe("/admin/ai-ops");
  });

  it("appends clubId as ai-ops URL state", () => {
    expect(aiOpsPathFromFilter({ errorCode: null, clubId: "club-1" })).toBe("/admin/ai-ops?clubId=club-1");
  });

  it("appends errorCode as ai-ops URL state", () => {
    expect(aiOpsPathFromFilter({ errorCode: "PROVIDER_RATE_LIMITED", clubId: null })).toBe(
      "/admin/ai-ops?errorCode=PROVIDER_RATE_LIMITED",
    );
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm --dir front test front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts`
Expected: FAIL — `aiOpsPathFromFilter is not a function`(또는 import 해결 실패).

- [ ] **Step 3: 최소 구현 추가**

`platform-admin-ai-ops-model.ts` 의 `aiOpsSearchFromFilter` 함수 바로 아래(`hasActiveAiOpsFilter` 위)에 추가한다:
```ts
export function aiOpsPathFromFilter(filter: AiOpsJobFilter): string {
  const search = aiOpsSearchFromFilter(filter).toString();
  return search ? `/admin/ai-ops?${search}` : "/admin/ai-ops";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --dir front test front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts`
Expected: PASS(신규 3건 포함 전체).

- [ ] **Step 5: 커밋**

```bash
git add front/features/platform-admin/model/platform-admin-ai-ops-model.ts front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts
git commit -m "feat: add ai-ops outbound path builder for deep links"
```

---

## Task 2: 감사 행 → ai-ops 드릴다운 결정 함수 `aiOpsDrilldownForAuditItem`

순수 함수로 "이 감사 행이 ai-ops 딥링크를 받는가, 받으면 어떤 경로인가"를 결정한다. AI_OPS 카테고리이고 `target.clubId`가 있을 때만 경로를 반환한다.

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-audit-model.ts`
- Test: `front/features/platform-admin/model/platform-admin-audit-model.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

import 블록을 수정하고 파일 끝에 describe 블록을 추가한다.

import 블록:
```ts
import { describe, expect, it } from "vitest";
import {
  adminAuditFiltersFromSearchParams,
  adminAuditSearchFromFilters,
  aiOpsDrilldownForAuditItem,
  labelAdminAuditOutcome,
  shouldShowAdminAuditDetailValue,
  type AdminAuditLedgerItem,
} from "./platform-admin-audit-model";
```

파일 끝에 추가:
```ts
function auditItem(overrides: Partial<AdminAuditLedgerItem> = {}): AdminAuditLedgerItem {
  return {
    id: "platform_audit_events:event-ai",
    occurredAt: "2026-05-31T00:00:00Z",
    sourceSlice: "S6",
    sourceTable: "platform_audit_events",
    actionCategory: "AI_OPS",
    actionType: "ADMIN_AI_OPS_RETRY_COMMIT",
    outcome: "SUCCESS",
    actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
    target: { clubId: "club-1", userId: null, jobId: "job-1", eventId: null, label: "AI job" },
    summary: "AI 커밋 재시도를 실행했습니다.",
    safeMetadata: [],
    metadataState: "AVAILABLE",
    ...overrides,
  };
}

describe("aiOpsDrilldownForAuditItem", () => {
  it("returns an ai-ops clubId path for an AI_OPS item with a club target", () => {
    expect(aiOpsDrilldownForAuditItem(auditItem())).toBe("/admin/ai-ops?clubId=club-1");
  });

  it("returns null when the action category is not AI_OPS", () => {
    expect(aiOpsDrilldownForAuditItem(auditItem({ actionCategory: "NOTIFICATION" }))).toBeNull();
  });

  it("returns null when the AI_OPS item has no club target", () => {
    expect(
      aiOpsDrilldownForAuditItem(
        auditItem({ target: { clubId: null, userId: null, jobId: "job-1", eventId: null, label: "AI job" } }),
      ),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm --dir front test front/features/platform-admin/model/platform-admin-audit-model.test.ts`
Expected: FAIL — `aiOpsDrilldownForAuditItem is not a function`.

- [ ] **Step 3: 최소 구현 추가**

`platform-admin-audit-model.ts` 상단 import 영역에 추가한다:
```ts
import {
  EMPTY_AI_OPS_FILTER,
  aiOpsPathFromFilter,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";
```

`shouldShowAdminAuditDetailValue` 함수 정의 아래에 추가한다:
```ts
export function aiOpsDrilldownForAuditItem(item: AdminAuditLedgerItem): string | null {
  if (item.actionCategory !== "AI_OPS") return null;
  const clubId = item.target.clubId;
  if (!clubId) return null;
  return aiOpsPathFromFilter({ ...EMPTY_AI_OPS_FILTER, clubId });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --dir front test front/features/platform-admin/model/platform-admin-audit-model.test.ts`
Expected: PASS.

- [ ] **Step 5: 린트로 intra-feature import 경계 확인**

Run: `pnpm --dir front lint`
Expected: PASS — model→model 동일 feature 내부 import는 경계 위반이 아니다. import-cycle/boundary 위반이 보고되면 멈추고 보고한다(해결 전 진행 금지).

- [ ] **Step 6: 커밋**

```bash
git add front/features/platform-admin/model/platform-admin-audit-model.ts front/features/platform-admin/model/platform-admin-audit-model.test.ts
git commit -m "feat: derive ai-ops drilldown path for AI_OPS audit rows"
```

---

## Task 3: AuditDetail에 AI Ops 딥링크 렌더

**Files:**
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.tsx`
- Test: `front/features/platform-admin/ui/admin-audit-ledger.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

import에 `MemoryRouter`를 추가하고, AI_OPS 행 클릭 시 상세 패널에 ai-ops 링크가 나타나는 테스트를 추가한다.

import 블록:
```ts
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { AdminAuditLedgerPage } from "@/features/platform-admin/model/platform-admin-audit-model";
import { AdminAuditLedger } from "./admin-audit-ledger";
```

`describe("AdminAuditLedger", ...)` 안, 기존 `it` 다음에 추가:
```ts
  it("links an AI_OPS row detail to the ai-ops club drilldown", async () => {
    const user = userEvent.setup();
    const aiPage: AdminAuditLedgerPage = {
      ...page,
      items: [
        {
          id: "platform_audit_events:event-ai",
          occurredAt: "2026-05-31T00:00:00Z",
          sourceSlice: "S6",
          sourceTable: "platform_audit_events",
          actionCategory: "AI_OPS",
          actionType: "ADMIN_AI_OPS_RETRY_COMMIT",
          outcome: "SUCCESS",
          actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
          target: { clubId: "club-7", userId: null, jobId: "job-1", eventId: null, label: "AI job" },
          summary: "AI 커밋 재시도를 실행했습니다.",
          safeMetadata: [],
          metadataState: "AVAILABLE",
        },
      ],
    };

    render(
      <MemoryRouter>
        <AdminAuditLedger
          page={aiPage}
          filters={{ range: "7d" }}
          loading={false}
          error={null}
          onFilterChange={vi.fn()}
          onLoadMore={vi.fn()}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /AI 커밋 재시도를 실행했습니다/ }));

    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(within(detail).getByRole("link", { name: /AI Ops에서 보기/ })).toHaveAttribute(
      "href",
      "/admin/ai-ops?clubId=club-7",
    );
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm --dir front test front/features/platform-admin/ui/admin-audit-ledger.test.tsx`
Expected: FAIL — `AI Ops에서 보기` 링크를 찾지 못함.

- [ ] **Step 3: 최소 구현 추가**

`admin-audit-ledger.tsx` 상단 import에 `Link`와 결정 함수를 추가한다:
```ts
import { Link } from "react-router-dom";
```
기존 model import 블록에 `aiOpsDrilldownForAuditItem`를 추가:
```ts
import {
  aiOpsDrilldownForAuditItem,
  labelAdminAuditOutcome,
  labelAdminAuditSourceSlice,
  shouldShowAdminAuditDetailValue,
  type AdminAuditFilters,
  type AdminAuditLedgerItem,
  type AdminAuditLedgerPage,
} from "@/features/platform-admin/model/platform-admin-audit-model";
```

`AuditDetail` 함수 안 `const safeMetadata = …` 줄 아래에 추가:
```ts
  const aiOpsPath = aiOpsDrilldownForAuditItem(item);
```
`{item.metadataState === "EMPTY" ? … }` 줄 **다음**, `</aside>` 닫기 직전에 추가:
```tsx
      {aiOpsPath ? (
        <Link to={aiOpsPath} className="admin-audit__drill">
          AI Ops에서 보기 →
        </Link>
      ) : null}
```

- [ ] **Step 4: 테스트 통과 확인 (신규 + 기존 회귀)**

Run: `pnpm --dir front test front/features/platform-admin/ui/admin-audit-ledger.test.tsx`
Expected: PASS — 신규 1건 + 기존(NOTIFICATION/SUPPORT 행은 AI_OPS가 아니라 링크 미렌더) 모두 통과.

- [ ] **Step 5: 커밋**

```bash
git add front/features/platform-admin/ui/admin-audit-ledger.tsx front/features/platform-admin/ui/admin-audit-ledger.test.tsx
git commit -m "feat: link AI_OPS audit detail to ai-ops club drilldown"
```

---

## Task 4: e2e — 감사 AI 행 → ai-ops clubId 드릴다운 round-trip + 정직한 empty

**Files:**
- Create: `front/tests/e2e/admin-audit-ai-ops-drilldown.spec.ts`

- [ ] **Step 1: e2e 스펙 작성**

`front/tests/e2e/admin-audit-ai-ops-drilldown.spec.ts` 를 생성한다. 셸/auth mock 패턴은 기존 `admin-audit.spec.ts`·`admin-ai-ops-drilldown.spec.ts`와 동일하다.

```ts
import { expect, test, type Page, type Route } from "@playwright/test";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

function platformAdminAuth(role: PlatformAdminRole): AuthMeResponse {
  const email = `${role.toLowerCase()}@example.com`;
  return {
    authenticated: true,
    userId: `platform-${role.toLowerCase()}-user`,
    membershipId: null,
    clubId: null,
    email,
    displayName: `${role} admin`,
    accountName: `${role} admin`,
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: { userId: `platform-${role.toLowerCase()}-user`, email, role },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeShell(page: Page, role: PlatformAdminRole): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, platformAdminAuth(role));
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await json(route, 200, {
      platformRole: role,
      activeClubCount: 1,
      domainActionRequiredCount: 0,
      domains: [],
      domainsRequiringAction: [],
    });
  });
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await json(route, 200, { items: [] });
  });
}

async function routeAudit(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/audit/events**", async (route) => {
    await json(route, 200, {
      generatedAt: "2026-05-31T00:00:00Z",
      filters: { range: "7d" },
      summary: { visibleCount: 1, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
      nextCursor: null,
      items: [
        {
          id: "platform_audit_events:event-ai",
          occurredAt: "2026-05-31T00:01:00Z",
          sourceSlice: "S6",
          sourceTable: "platform_audit_events",
          actionCategory: "AI_OPS",
          actionType: "ADMIN_AI_OPS_RETRY_COMMIT",
          outcome: "SUCCESS",
          actor: { userId: "platform-owner-user", role: "OWNER", displayLabel: "OWNER" },
          target: { clubId: "club-1", userId: null, jobId: "job-1", eventId: null, label: "AI job" },
          summary: "AI 커밋 재시도를 실행했습니다.",
          safeMetadata: [{ label: "previousStatus", value: "COMMITTING", kind: "code" }],
          metadataState: "AVAILABLE",
        },
      ],
    });
  });
}

function aiJob(clubId: string) {
  return {
    jobId: "job-1",
    club: { clubId, slug: "club-one", name: "Club One" },
    session: { sessionId: "session-1", number: 7, bookTitle: "Book" },
    status: "SUCCEEDED",
    stage: "READY",
    provider: "OPENAI",
    model: "gpt-model",
    errorCode: null,
    safeErrorMessage: null,
    costEstimateUsd: "0.1000",
    createdAt: "2026-05-31T00:00:00Z",
    lastUpdatedAt: "2026-05-31T00:01:00Z",
    expiresAt: null,
    staleCandidate: false,
    availableActions: [],
  };
}

async function routeAiOps(page: Page, opts: { matchClubId: string }): Promise<void> {
  await page.route("**/api/bff/api/admin/ai-generation/summary**", async (route) => {
    await json(route, 200, {
      activeJobCount: 0,
      failedLast24h: 0,
      monthToDateCostEstimateUsd: "0.1000",
      failureCodes: [],
      providerCosts: [],
      staleCandidateCount: 0,
      costTrend: {
        window: "30d",
        currentCostUsd: "0.1000",
        priorCostUsd: "0.0000",
        currentJobCount: 1,
        priorJobCount: 0,
        deltaDirection: "NONE",
        availability: "NOT_ENOUGH_DATA",
      },
    });
  });
  await page.route("**/api/bff/api/admin/ai-generation/jobs**", async (route) => {
    const url = new URL(route.request().url());
    const clubId = url.searchParams.get("clubId");
    const items = clubId === opts.matchClubId ? [aiJob(opts.matchClubId)] : [];
    await json(route, 200, { items, nextCursor: null });
  });
}

test("owner drills from an AI_OPS audit row into the affected club's ai-ops jobs", async ({ page }) => {
  await routeShell(page, "OWNER");
  await routeAudit(page);
  await routeAiOps(page, { matchClubId: "club-1" });

  await page.goto("/admin/audit");

  await page.getByRole("button", { name: /AI 커밋 재시도를 실행했습니다/ }).click();

  const detail = page.getByRole("region", { name: "감사 이벤트 상세" });
  await detail.getByRole("link", { name: /AI Ops에서 보기/ }).click();

  await expect(page).toHaveURL(/\/admin\/ai-ops\?clubId=club-1/);
  await expect(page.getByRole("heading", { name: "AI Ops", level: 1 })).toBeVisible();
  await expect(page.getByText("Club One")).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 보기" })).toBeVisible();

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page).not.toHaveURL(/clubId=/);

  await expect(page.getByText("@example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
});

test("ai-ops drilldown shows an honest empty state when the club has no jobs", async ({ page }) => {
  await routeShell(page, "OWNER");
  await routeAudit(page);
  await routeAiOps(page, { matchClubId: "club-other" });

  await page.goto("/admin/audit");
  await page.getByRole("button", { name: /AI 커밋 재시도를 실행했습니다/ }).click();
  await page.getByRole("region", { name: "감사 이벤트 상세" }).getByRole("link", { name: /AI Ops에서 보기/ }).click();

  await expect(page).toHaveURL(/\/admin\/ai-ops\?clubId=club-1/);
  await expect(page.getByText("이 필터에 해당하는 AI job이 없습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 보기" })).toBeVisible();
});
```

- [ ] **Step 2: e2e 통과 확인**

Run: `pnpm --dir front test:e2e admin-audit-ai-ops-drilldown`
Expected: 2 tests PASS. (구현이 빠졌다면 링크 부재로 FAIL.)

- [ ] **Step 3: 커밋**

```bash
git add front/tests/e2e/admin-audit-ai-ops-drilldown.spec.ts
git commit -m "test: cover audit AI_OPS row to ai-ops drilldown e2e"
```

---

## Task 5: health AI provider 카드 → ai-ops 링크 회귀 가드

health의 AI provider 카드는 이미 `/admin/ai-ops`로 drill한다. 연결성이 회귀하지 않도록 기존 health e2e에 href assertion 한 줄을 추가한다.

**Files:**
- Modify: `front/tests/e2e/admin-health.spec.ts`

- [ ] **Step 1: assertion 추가**

`admin-health.spec.ts` 의 `test("operator views /admin/health grid", …)` 안, `await expect(page.getByText(/NaN/)).toHaveCount(0);` 줄 **앞**에 추가:
```ts
  await expect(
    page.locator("article", { hasText: "AI provider availability" }).getByRole("link", { name: /자세히/ }),
  ).toHaveAttribute("href", "/admin/ai-ops");
```

- [ ] **Step 2: e2e 통과 확인**

Run: `pnpm --dir front test:e2e admin-health`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add front/tests/e2e/admin-health.spec.ts
git commit -m "test: guard health AI card links to ai-ops"
```

---

## Task 6: Phase C CHANGELOG + Phase C 게이트 검증

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Unreleased Engineering 항목 추가**

`CHANGELOG.md` 의 `### Engineering` 목록 맨 위(가장 최근 platform-admin 항목 바로 위)에 추가한다:
```markdown
- **platform-admin:** `/admin/audit`의 AI 운영(AI_OPS) 감사 행 상세에 `/admin/ai-ops?clubId=…` 드릴다운 링크를 추가해, 운영자가 감사 신호에서 해당 클럽의 AI job 필터 뷰(원인→조치)로 바로 이동할 수 있게 했습니다. `/admin/health`의 AI provider 카드는 이미 `/admin/ai-ops`로 연결됩니다. 신규 서버 계약 없이 기존 `target.clubId`만 사용하며, P1 필터 모델(`?clubId=`/`?errorCode=`)을 SSOT로 재사용합니다. raw provider error/transcript는 노출하지 않습니다.
```

- [ ] **Step 2: Phase C 게이트 — 프런트 전체 회귀**

```
pnpm --dir front lint          # Expected: PASS
pnpm --dir front test          # Expected: PASS (전체 단위 스위트)
pnpm --dir front build         # Expected: PASS
pnpm --dir front test:e2e admin-audit-ai-ops-drilldown admin-health admin-ai-ops-drilldown admin-audit   # Expected: 관련 e2e 모두 PASS
```
스킵하는 검사가 있으면 정확한 명령과 이유를 기록한다. **이 게이트를 통과해야 Phase D로 진행한다.**

- [ ] **Step 3: 커밋**

```bash
git add CHANGELOG.md
git commit -m "docs: record admin ai-ops surface connectivity in changelog"
```

---

# PHASE D — Host-surface 보강 (S9)

> club-operations의 host-적절 subset(readiness/sessionProgress/aiUsage)을 중립 계약 `front/shared/model/club-operations.ts`로 분리한다. admin·host 양쪽이 이 중립 계약을 import하고, 서버는 기존 `AdminClubOperationsSnapshotPort`를 재사용해 host-scoped projection을 반환한다. host는 **read-only** 재사용 — write 명령 비이전, 신규 host CRUD 없음. **Phase C 게이트 통과 후 시작한다.**

## Task 7: 중립 club-operations 계약 + 순수 헬퍼

`front/shared/model/club-operations.ts` 에 admin·host가 공유하는 host-안전 subset 타입과 순수 헬퍼를 정의한다. 이 모듈은 어떤 feature도 import하지 않는다(중립 owner).

**Files:**
- Create: `front/shared/model/club-operations.ts`
- Test: `front/shared/model/club-operations.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`front/shared/model/club-operations.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { clubAiFailureDelta, type ClubAiUsageSummary } from "./club-operations";

function aiUsage(overrides: Partial<ClubAiUsageSummary> = {}): ClubAiUsageSummary {
  return {
    activeJobs: 0,
    failedRecentJobs: 0,
    staleCandidates: 0,
    costEstimateUsd: "0.0000",
    state: "HEALTHY",
    priorFailedJobs7d: 0,
    ...overrides,
  };
}

describe("clubAiFailureDelta", () => {
  it("returns the recent-minus-prior failure delta", () => {
    expect(clubAiFailureDelta(aiUsage({ failedRecentJobs: 5, priorFailedJobs7d: 2 }))).toBe(3);
  });

  it("returns a negative delta when failures dropped", () => {
    expect(clubAiFailureDelta(aiUsage({ failedRecentJobs: 1, priorFailedJobs7d: 4 }))).toBe(-3);
  });

  it("returns zero when both windows are empty", () => {
    expect(clubAiFailureDelta(aiUsage())).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm --dir front test front/shared/model/club-operations.test.ts`
Expected: FAIL — 모듈/`clubAiFailureDelta` 해결 실패.

- [ ] **Step 3: 최소 구현 추가**

`front/shared/model/club-operations.ts`:
```ts
export type ClubReadinessSummary = {
  state: string;
  blockingReasons: string[];
  nextAction: string | null;
};

export type ClubSessionProgress = {
  upcomingCount: number;
  currentOpenCount: number;
  closedCount: number;
  publishedRecordCount: number;
  incompleteRecordCount: number;
};

export type ClubAiUsageSummary = {
  activeJobs: number;
  failedRecentJobs: number;
  staleCandidates: number;
  costEstimateUsd: string;
  state: string;
  priorFailedJobs7d: number;
};

export type HostClubOperationsSnapshot = {
  schema: "host.club_operations_snapshot.v1";
  generatedAt: string;
  club: { clubId: string; slug: string; name: string };
  readiness: ClubReadinessSummary;
  sessionProgress: ClubSessionProgress;
  aiUsage: ClubAiUsageSummary;
};

export function clubAiFailureDelta(aiUsage: ClubAiUsageSummary): number {
  return aiUsage.failedRecentJobs - aiUsage.priorFailedJobs7d;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --dir front test front/shared/model/club-operations.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add front/shared/model/club-operations.ts front/shared/model/club-operations.test.ts
git commit -m "feat: add neutral club-operations contract for admin and host"
```

---

## Task 8: admin 모델이 중립 계약을 SSOT로 import (비파괴 리팩터)

admin snapshot의 `readiness`/`sessionProgress`/`aiUsage` 인라인 타입을 중립 계약 타입으로 교체하고, `aiFailureDelta`를 `clubAiFailureDelta`에 위임한다. shape이 구조적으로 동일하므로 admin 동작/테스트는 불변이다.

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-club-operations-model.ts`
- Test(회귀): `front/features/platform-admin/model/platform-admin-club-operations-model.test.ts`

- [ ] **Step 1: 리팩터 적용**

`platform-admin-club-operations-model.ts` 상단에 import 추가:
```ts
import type {
  ClubAiUsageSummary,
  ClubReadinessSummary,
  ClubSessionProgress,
} from "@/shared/model/club-operations";
import { clubAiFailureDelta } from "@/shared/model/club-operations";
```

`AdminClubOperationsSnapshot` 타입에서 `readiness`/`sessionProgress`/`aiUsage` 인라인 정의를 중립 타입 참조로 교체한다:
```ts
export type AdminClubOperationsSnapshot = {
  schema: "admin.club_operations_snapshot.v1";
  generatedAt: string;
  club: {
    clubId: string;
    slug: string;
    name: string;
    status: string;
    publicVisibility: string;
  };
  readiness: ClubReadinessSummary;
  memberActivity: {
    activeCount: number;
    dormantCount: number;
    pendingViewerCount: number;
    hostCount: number;
  };
  sessionProgress: ClubSessionProgress;
  notificationHealth: {
    pending: number;
    failed: number;
    dead: number;
    lastSuccessAt: string | null;
    failureClusters: Array<{ safeErrorCode: string; count: number }>;
    recentFailed7d: number;
    priorFailed7d: number;
  };
  aiUsage: ClubAiUsageSummary;
  safeLinks: Array<{
    label: string;
    href: string;
    kind: "ADMIN_ROUTE" | "HOST_ROUTE";
  }>;
};
```

`aiFailureDelta` 본문을 위임으로 교체한다(시그니처 유지):
```ts
export function aiFailureDelta(snapshot: AdminClubOperationsSnapshot): number {
  return clubAiFailureDelta(snapshot.aiUsage);
}
```
`notificationFailureDelta`·`blockerNextAction`·`ClubNextAction`은 그대로 둔다.

- [ ] **Step 2: admin 모델 회귀 테스트 통과 확인**

Run: `pnpm --dir front test front/features/platform-admin/model/platform-admin-club-operations-model.test.ts`
Expected: PASS — 기존 테스트가 변경 없이 통과(shape 동일).

- [ ] **Step 3: 경계 lint 확인**

Run: `pnpm --dir front lint`
Expected: PASS — `features/platform-admin` → `shared/model` import는 허용 방향(shared는 중립). 위반 보고 시 멈추고 보고한다.

- [ ] **Step 4: 커밋**

```bash
git add front/features/platform-admin/model/platform-admin-club-operations-model.ts
git commit -m "refactor: source admin club-ops subtypes from neutral contract"
```

---

## Task 9: 서버 host-scoped 모델 + use-case 포트

기존 `AdminClubOperationsSnapshot`을 host-안전 subset으로 투영하는 도메인 모델과 use-case 인터페이스를 추가한다.

**Files:**
- Create: `server/src/main/kotlin/com/readmates/club/application/model/HostClubOperationsModels.kt`
- Create: `server/src/main/kotlin/com/readmates/club/application/port/in/GetHostClubOperationsUseCase.kt`

- [ ] **Step 1: host 모델 정의**

`HostClubOperationsModels.kt`:
```kotlin
package com.readmates.club.application.model

import java.time.OffsetDateTime

data class HostClubOperationsSnapshot(
    val schema: String = "host.club_operations_snapshot.v1",
    val generatedAt: OffsetDateTime,
    val club: HostClubOperationsClub,
    val readiness: AdminClubReadinessSummary,
    val sessionProgress: AdminClubSessionProgress,
    val aiUsage: AdminClubAiUsage,
)

data class HostClubOperationsClub(
    val clubId: java.util.UUID,
    val slug: String,
    val name: String,
)

fun AdminClubOperationsSnapshot.toHostSnapshot(): HostClubOperationsSnapshot =
    HostClubOperationsSnapshot(
        generatedAt = generatedAt,
        club =
            HostClubOperationsClub(
                clubId = club.clubId,
                slug = club.slug,
                name = club.name,
            ),
        readiness = readiness,
        sessionProgress = sessionProgress,
        aiUsage = aiUsage,
    )
```
주: `readiness`/`sessionProgress`/`aiUsage`는 기존 admin 모델 data class를 재사용한다(같은 shape). `memberActivity`·`notificationHealth`·`safeLinks`·`club.status`/`club.publicVisibility`는 의도적으로 제외한다(admin-only/host 불필요 신호).

- [ ] **Step 2: use-case 인터페이스 정의**

`GetHostClubOperationsUseCase.kt`:
```kotlin
package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.HostClubOperationsSnapshot
import com.readmates.shared.security.CurrentMember

interface GetHostClubOperationsUseCase {
    fun hostOperationsSnapshot(host: CurrentMember): HostClubOperationsSnapshot
}
```

- [ ] **Step 3: 컴파일 확인**

Run: `./server/gradlew -p server compileKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: 커밋**

```bash
git add server/src/main/kotlin/com/readmates/club/application/model/HostClubOperationsModels.kt server/src/main/kotlin/com/readmates/club/application/port/in/GetHostClubOperationsUseCase.kt
git commit -m "feat: add host club-operations model and use-case port"
```

---

## Task 10: 서버 host service — projection + host 권한 (TDD)

host의 자기 클럽 snapshot을 기존 `AdminClubOperationsSnapshotPort`로 로드해 host subset으로 투영한다. host가 아니면 거부한다.

**Files:**
- Create: `server/src/main/kotlin/com/readmates/club/application/service/HostClubOperationsService.kt`
- Test: `server/src/test/kotlin/com/readmates/club/application/service/HostClubOperationsServiceTest.kt`

- [ ] **Step 1: 실패하는 테스트 작성**

`HostClubOperationsServiceTest.kt`:
```kotlin
package com.readmates.club.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.AdminClubAiUsage
import com.readmates.club.application.model.AdminClubMemberActivity
import com.readmates.club.application.model.AdminClubNotificationHealth
import com.readmates.club.application.model.AdminClubOperationsClub
import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminClubReadinessSummary
import com.readmates.club.application.model.AdminClubSafeLink
import com.readmates.club.application.model.AdminClubSessionProgress
import com.readmates.club.application.port.out.AdminClubOperationsSnapshotPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostClubOperationsServiceTest {
    private val clubId = UUID.randomUUID()

    private fun snapshot() =
        AdminClubOperationsSnapshot(
            generatedAt = OffsetDateTime.parse("2026-05-31T00:00:00Z"),
            club = AdminClubOperationsClub(clubId, "club-one", "Club One", "ACTIVE", "PUBLIC"),
            readiness = AdminClubReadinessSummary("READY", emptyList(), null),
            memberActivity = AdminClubMemberActivity(3, 1, 0, 1),
            sessionProgress = AdminClubSessionProgress(1, 1, 4, 3, 1),
            notificationHealth = AdminClubNotificationHealth(0, 0, 0, null, emptyList(), 0, 0),
            aiUsage = AdminClubAiUsage(1, 2, 0, "0.5000", "DEGRADED", 1),
            safeLinks = listOf(AdminClubSafeLink("운영 상세", "/admin/clubs/$clubId", "ADMIN_ROUTE")),
        )

    private fun host(role: MembershipRole) =
        CurrentMember(
            userId = UUID.randomUUID(),
            membershipId = UUID.randomUUID(),
            clubId = clubId,
            clubSlug = "club-one",
            email = "host@example.com",
            displayName = "Host",
            accountName = "host",
            role = role,
            membershipStatus = MembershipStatus.ACTIVE,
            clubName = "Club One",
        )

    private fun service(port: AdminClubOperationsSnapshotPort) = HostClubOperationsService(port)

    @Test
    fun `projects own club snapshot to host subset`() {
        val port = AdminClubOperationsSnapshotPort { id -> if (id == clubId) snapshot() else null }
        val result = service(port).hostOperationsSnapshot(host(MembershipRole.HOST))

        assertThat(result.schema).isEqualTo("host.club_operations_snapshot.v1")
        assertThat(result.club.clubId).isEqualTo(clubId)
        assertThat(result.readiness.state).isEqualTo("READY")
        assertThat(result.sessionProgress.closedCount).isEqualTo(4)
        assertThat(result.aiUsage.state).isEqualTo("DEGRADED")
    }

    @Test
    fun `denies a non-host member`() {
        val port = AdminClubOperationsSnapshotPort { snapshot() }
        assertThatThrownBy { service(port).hostOperationsSnapshot(host(MembershipRole.MEMBER)) }
            .isInstanceOf(AccessDeniedException::class.java)
    }
}
```
주: `AdminClubOperationsSnapshotPort`가 단일 추상 메서드(`loadSnapshot`)인지 확인한다. SAM이 아니면 위 람다 대신 `object : AdminClubOperationsSnapshotPort { override fun loadSnapshot(clubId: UUID) = … }`로 바꾼다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `./server/gradlew -p server test --tests "com.readmates.club.application.service.HostClubOperationsServiceTest"`
Expected: FAIL — `HostClubOperationsService` 미존재로 컴파일 실패.

- [ ] **Step 3: 최소 구현 추가**

`HostClubOperationsService.kt`:
```kotlin
package com.readmates.club.application.service

import com.readmates.club.application.model.HostClubOperationsSnapshot
import com.readmates.club.application.model.toHostSnapshot
import com.readmates.club.application.port.`in`.GetHostClubOperationsUseCase
import com.readmates.club.application.port.out.AdminClubOperationsSnapshotPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service

@Service
class HostClubOperationsService(
    private val snapshotPort: AdminClubOperationsSnapshotPort,
) : GetHostClubOperationsUseCase {
    override fun hostOperationsSnapshot(host: CurrentMember): HostClubOperationsSnapshot {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }
        val snapshot =
            snapshotPort.loadSnapshot(host.clubId)
                ?: throw AccessDeniedException("Club operations snapshot unavailable")
        return snapshot.toHostSnapshot()
    }
}
```
주: `AccessDeniedException` 생성자 시그니처를 기존 사용처(`HostNotificationController`가 import)와 맞춘다. 단일 String 인자가 아니면 해당 시그니처로 조정한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `./server/gradlew -p server test --tests "com.readmates.club.application.service.HostClubOperationsServiceTest"`
Expected: PASS (2건).

- [ ] **Step 5: 커밋**

```bash
git add server/src/main/kotlin/com/readmates/club/application/service/HostClubOperationsService.kt server/src/test/kotlin/com/readmates/club/application/service/HostClubOperationsServiceTest.kt
git commit -m "feat: project host-scoped club operations with host authorization"
```

---

## Task 11: 서버 host 컨트롤러 + 응답 DTO + 경계 검증

`/api/host/club-operations` 를 host 인증으로 노출한다. admin-only 신호는 응답 shape에 존재하지 않는다.

**Files:**
- Create: `server/src/main/kotlin/com/readmates/club/adapter/in/web/HostClubOperationsController.kt`

- [ ] **Step 1: 컨트롤러 + DTO 작성**

`HostClubOperationsController.kt`:
```kotlin
@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.model.HostClubOperationsSnapshot
import com.readmates.club.application.port.`in`.GetHostClubOperationsUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/host/club-operations")
class HostClubOperationsController(
    private val getHostClubOperationsUseCase: GetHostClubOperationsUseCase,
) {
    @GetMapping
    fun operations(host: CurrentMember): HostClubOperationsSnapshotResponse =
        HostClubOperationsSnapshotResponse.from(getHostClubOperationsUseCase.hostOperationsSnapshot(host))
}

data class HostClubOperationsSnapshotResponse(
    val schema: String,
    val generatedAt: String,
    val club: Any,
    val readiness: Any,
    val sessionProgress: Any,
    val aiUsage: Any,
) {
    companion object {
        fun from(snapshot: HostClubOperationsSnapshot): HostClubOperationsSnapshotResponse =
            HostClubOperationsSnapshotResponse(
                schema = snapshot.schema,
                generatedAt = snapshot.generatedAt.toString(),
                club = snapshot.club,
                readiness = snapshot.readiness,
                sessionProgress = snapshot.sessionProgress,
                aiUsage = snapshot.aiUsage,
            )
    }
}
```

- [ ] **Step 2: 컴파일 + 아키텍처 경계 테스트**

```
./server/gradlew -p server compileKotlin          # Expected: BUILD SUCCESSFUL
./server/gradlew -p server architectureTest        # Expected: PASS (club 슬라이스 web→application 방향 유지)
```
architectureTest가 새 슬라이스 등록을 요구하면(레지스트리 갱신 필요) 보고하고, 기존 `club` 슬라이스 컨벤션에 맞춰 등록 후 재실행한다.

- [ ] **Step 3: 커밋**

```bash
git add server/src/main/kotlin/com/readmates/club/adapter/in/web/HostClubOperationsController.kt
git commit -m "feat: expose host club-operations endpoint"
```

---

## Task 12: 프런트 host api + 계약 타입 + query

**Files:**
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/api/host-contracts.ts`
- Create: `front/features/host/queries/host-club-operations-queries.ts`

- [ ] **Step 1: 계약 타입 추가**

`host-contracts.ts` 상단 import에 추가:
```ts
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
```
파일 끝(다른 export 뒤)에 재노출 타입 추가:
```ts
export type HostClubOperationsResponse = HostClubOperationsSnapshot;
```

- [ ] **Step 2: api fetch 추가**

`host-api.ts` 의 기존 host fetch 패턴(`fetchHostNotificationSummary` 등, `context: { clubSlug }` 사용)을 그대로 따른다. 다음을 추가한다:
```ts
export function fetchHostClubOperations(context: { clubSlug: string | undefined }) {
  return readmatesFetch<HostClubOperationsResponse>("/api/host/club-operations", undefined, context);
}
```
`HostClubOperationsResponse` import를 `host-contracts`에서 가져온다(파일 상단 import 블록에 추가). `readmatesFetch` import 형태는 동일 파일의 기존 사용과 일치시킨다.

- [ ] **Step 3: query 모듈 추가**

`host-club-operations-queries.ts`:
```ts
import { queryOptions } from "@tanstack/react-query";
import { fetchHostClubOperations } from "@/features/host/api/host-api";

export const hostClubOperationsKeys = {
  all: ["host", "club-operations"] as const,
  snapshot: (clubSlug: string | undefined) => [...hostClubOperationsKeys.all, clubSlug ?? "__self__"] as const,
} as const;

export function hostClubOperationsQuery(context: { clubSlug: string | undefined }) {
  return queryOptions({
    queryKey: hostClubOperationsKeys.snapshot(context.clubSlug),
    queryFn: () => fetchHostClubOperations(context),
  });
}
```

- [ ] **Step 4: 타입/빌드 확인**

Run: `pnpm --dir front build`
Expected: PASS (타입 해결).

- [ ] **Step 5: 커밋**

```bash
git add front/features/host/api/host-api.ts front/features/host/api/host-contracts.ts front/features/host/queries/host-club-operations-queries.ts
git commit -m "feat: add host club-operations api and query"
```

---

## Task 13: host UI 운영 신호 카드 (read-only) + 로더 시딩

host dashboard에 자기 클럽 readiness/세션/AI 사용량을 read-only로 보여주는 카드를 추가한다. write 액션 없음.

**Files:**
- Create: `front/features/host/ui/host-club-operations-card.tsx`
- Test: `front/features/host/ui/host-club-operations-card.test.tsx`
- Modify: `front/features/host/route/host-dashboard-data.ts`
- Modify: `front/features/host/ui/host-dashboard.tsx`

- [ ] **Step 1: 실패하는 카드 테스트 작성**

`host-club-operations-card.test.tsx`:
```ts
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import { HostClubOperationsCard } from "./host-club-operations-card";

function snapshot(overrides: Partial<HostClubOperationsSnapshot> = {}): HostClubOperationsSnapshot {
  return {
    schema: "host.club_operations_snapshot.v1",
    generatedAt: "2026-05-31T00:00:00Z",
    club: { clubId: "club-1", slug: "club-one", name: "Club One" },
    readiness: { state: "READY", blockingReasons: [], nextAction: null },
    sessionProgress: { upcomingCount: 1, currentOpenCount: 1, closedCount: 4, publishedRecordCount: 3, incompleteRecordCount: 1 },
    aiUsage: { activeJobs: 1, failedRecentJobs: 3, staleCandidates: 0, costEstimateUsd: "0.5000", state: "DEGRADED", priorFailedJobs7d: 1 },
    ...overrides,
  };
}

describe("HostClubOperationsCard", () => {
  it("renders readiness, session, and AI usage signals read-only", () => {
    render(<HostClubOperationsCard snapshot={snapshot()} />);
    expect(screen.getByText("운영 신호")).toBeInTheDocument();
    expect(screen.getByText(/READY/)).toBeInTheDocument();
    expect(screen.getByText(/AI 실패/)).toBeInTheDocument();
    // 증가 델타(+2)를 표시
    expect(screen.getByText(/\+2/)).toBeInTheDocument();
    // read-only: 어떤 버튼도 없음
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows blocking reasons when readiness is not ready", () => {
    render(
      <HostClubOperationsCard
        snapshot={snapshot({ readiness: { state: "BLOCKED", blockingReasons: ["HOST_REQUIRED"], nextAction: null } })}
      />,
    );
    expect(screen.getByText(/HOST_REQUIRED/)).toBeInTheDocument();
  });
}
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm --dir front test front/features/host/ui/host-club-operations-card.test.tsx`
Expected: FAIL — 컴포넌트 미존재.

- [ ] **Step 3: 카드 구현**

`host-club-operations-card.tsx` (presentation-only, props로만 데이터 수신 — server-state 모듈 import 금지):
```tsx
import { clubAiFailureDelta, type HostClubOperationsSnapshot } from "@/shared/model/club-operations";

function formatDelta(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function HostClubOperationsCard({ snapshot }: { snapshot: HostClubOperationsSnapshot }) {
  const aiDelta = clubAiFailureDelta(snapshot.aiUsage);
  return (
    <section className="host-club-ops" aria-label="운영 신호">
      <h2>운영 신호</h2>
      <dl className="host-club-ops__grid">
        <div>
          <dt>준비 상태</dt>
          <dd>{snapshot.readiness.state}</dd>
        </div>
        <div>
          <dt>열린 세션</dt>
          <dd>{snapshot.sessionProgress.currentOpenCount}</dd>
        </div>
        <div>
          <dt>마감 대기</dt>
          <dd>{snapshot.sessionProgress.incompleteRecordCount}</dd>
        </div>
        <div>
          <dt>AI 실패 (최근 7일)</dt>
          <dd>
            {snapshot.aiUsage.failedRecentJobs}건 <span className="host-club-ops__delta">({formatDelta(aiDelta)})</span>
          </dd>
        </div>
      </dl>
      {snapshot.readiness.blockingReasons.length > 0 ? (
        <ul className="host-club-ops__blockers">
          {snapshot.readiness.blockingReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: 카드 테스트 통과 확인**

Run: `pnpm --dir front test front/features/host/ui/host-club-operations-card.test.tsx`
Expected: PASS (2건).

- [ ] **Step 5: 로더 시딩 + 대시보드 렌더 연결**

`host-dashboard-data.ts`:
- import에 추가:
```ts
import { fetchHostClubOperations } from "@/features/host/api/host-api";
import { hostClubOperationsQuery } from "@/features/host/queries/host-club-operations-queries";
import type { HostClubOperationsResponse } from "@/features/host/api/host-contracts";
```
- `HostDashboardRouteData` 타입에 `clubOperations: HostClubOperationsResponse | null;` 필드 추가.
- `Promise.all([...])` 배열에 추가(실패해도 대시보드 나머지를 막지 않도록 catch):
```ts
      fetchHostClubOperations(context).catch(() => null),
```
구조분해 변수에 `clubOperations`를 추가하고, 성공 시 query cache 시딩:
```ts
    if (clubOperations) {
      client.setQueryData(hostClubOperationsQuery(context).queryKey, clubOperations);
    }
```
반환 객체에 `clubOperations` 추가.

`host-dashboard.tsx`:
- import에 카드 추가: `import { HostClubOperationsCard } from "@/features/host/ui/host-club-operations-card";`
- 라우트 데이터에서 `clubOperations`를 읽어 존재할 때만 렌더(대시보드 상단 운영 요약 영역, 기존 카드 배치 컨벤션에 맞춰):
```tsx
{clubOperations ? <HostClubOperationsCard snapshot={clubOperations} /> : null}
```

- [ ] **Step 6: 빌드 + 대시보드 단위 회귀**

```
pnpm --dir front build      # Expected: PASS
pnpm --dir front test front/features/host   # Expected: PASS (host 단위 스위트 회귀)
```

- [ ] **Step 7: 커밋**

```bash
git add front/features/host/ui/host-club-operations-card.tsx front/features/host/ui/host-club-operations-card.test.tsx front/features/host/route/host-dashboard-data.ts front/features/host/ui/host-dashboard.tsx
git commit -m "feat: render read-only host club operations signals on dashboard"
```

---

## Task 14: 계약 경계 테스트 + host e2e

admin·host가 서로를 직접 import하지 않고 오직 중립 계약을 통해서만 공유함을 강제하고, host 표면에서 공유 운영 신호가 렌더링됨을 e2e로 검증한다.

**Files:**
- Create: `front/tests/unit/club-operations-contract-boundary.test.ts`
- Create: `front/tests/e2e/host-club-operations.spec.ts`

- [ ] **Step 1: 경계 테스트 작성**

`club-operations-contract-boundary.test.ts` (기존 `host-notifications-ui-boundary.test.ts` 패턴 차용):
```ts
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep, posix } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function collectFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(entryPath);
  }
  return files;
}

function toPosixRelative(absolutePath: string): string {
  return absolutePath.slice(repoRoot.length + 1).split(sep).join(posix.sep);
}

function scan(featureDir: string, forbidden: RegExp): string[] {
  const files = collectFiles(resolve(repoRoot, featureDir));
  const violations: string[] = [];
  for (const absolutePath of files) {
    const source = readFileSync(absolutePath, "utf8");
    if (forbidden.test(source)) violations.push(toPosixRelative(absolutePath));
  }
  return violations;
}

describe("club-operations contract boundary", () => {
  it("features/host does not import from features/platform-admin", () => {
    expect(scan("features/host", /from\s+["']@\/features\/platform-admin\//)).toEqual([]);
  });

  it("features/platform-admin does not import from features/host", () => {
    expect(scan("features/platform-admin", /from\s+["']@\/features\/host\//)).toEqual([]);
  });
});
```

- [ ] **Step 2: 경계 테스트 통과 확인**

Run: `pnpm --dir front test front/tests/unit/club-operations-contract-boundary.test.ts`
Expected: PASS — 공유는 `@/shared/model/club-operations`를 통해서만 일어난다. 위반이 나오면 해당 import를 중립 계약 경유로 고친 뒤 재실행한다.

- [ ] **Step 3: host e2e 작성**

`host-club-operations.spec.ts` — host 인증 셸 mock은 기존 host e2e(`front/tests/e2e/` 의 host 스펙)에서 패턴을 차용한다. `/api/bff/api/host/club-operations` 를 mock하고, dashboard에 운영 신호 카드가 보이고 admin 전용 신호(member email 등)가 없음을 단언한다.
```ts
import { expect, test, type Page, type Route } from "@playwright/test";

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeHostClubOperations(page: Page): Promise<void> {
  await page.route("**/api/bff/api/host/club-operations", async (route) => {
    await json(route, 200, {
      schema: "host.club_operations_snapshot.v1",
      generatedAt: "2026-05-31T00:00:00Z",
      club: { clubId: "club-1", slug: "club-one", name: "Club One" },
      readiness: { state: "READY", blockingReasons: [], nextAction: null },
      sessionProgress: { upcomingCount: 1, currentOpenCount: 1, closedCount: 4, publishedRecordCount: 3, incompleteRecordCount: 1 },
      aiUsage: { activeJobs: 1, failedRecentJobs: 3, staleCandidates: 0, costEstimateUsd: "0.5000", state: "DEGRADED", priorFailedJobs7d: 1 },
    });
  });
}

test("host sees shared operating signals on the dashboard", async ({ page }) => {
  // TODO(executor): 기존 host dashboard e2e의 auth/shell/route mock 헬퍼를 재사용해
  // host 세션으로 로그인하고 dashboard로 이동하는 전제 조건을 구성한다.
  await routeHostClubOperations(page);
  await page.goto("/clubs/club-one/app/host"); // 실제 host dashboard 경로는 기존 host 스펙에서 확인해 맞춘다

  const card = page.getByRole("region", { name: "운영 신호" });
  await expect(card).toBeVisible();
  await expect(card.getByText(/READY/)).toBeVisible();
  await expect(card.getByText(/AI 실패/)).toBeVisible();

  // 공개 안전: admin 전용/raw 신호 부재
  await expect(page.getByText("@example.com")).toHaveCount(0);
  await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
});
```
주: host e2e의 auth/shell 셋업은 프로젝트마다 헬퍼가 있으므로, 실행자는 기존 host dashboard 스펙(예: `host-dashboard*.spec.ts`)의 `routeShell`/auth mock을 그대로 차용해 위 `TODO(executor)` 자리를 채운다. 실제 host dashboard URL도 그 스펙에서 확인한다.

- [ ] **Step 4: host e2e 통과 확인**

Run: `pnpm --dir front test:e2e host-club-operations`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add front/tests/unit/club-operations-contract-boundary.test.ts front/tests/e2e/host-club-operations.spec.ts
git commit -m "test: enforce club-ops contract boundary and host signal rendering"
```

---

## Task 15: Phase D CHANGELOG + Phase D 게이트 검증

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Unreleased Engineering 항목 추가**

`### Engineering` 목록 상단에 추가:
```markdown
- **host-surface:** club operations의 host-적절 신호(준비 상태·세션 진행·AI 사용량)를 중립 계약 `front/shared/model/club-operations.ts`로 분리해 admin·host가 공유합니다. host dashboard는 `/api/host/club-operations`(host 인증, 자기 클럽만)로 read-only 운영 신호 카드를 렌더합니다. admin 전용 신호(support grant, raw member email, notification replay, safeLinks)는 host projection에서 제외하며, admin↔host 직접 import는 경계 테스트로 차단합니다. host에 write 명령은 추가하지 않습니다.
```

- [ ] **Step 2: Phase D 게이트 — 프런트 + 서버 회귀**

```
pnpm --dir front lint                         # Expected: PASS
pnpm --dir front test                         # Expected: PASS (경계 테스트 포함 전체)
pnpm --dir front build                        # Expected: PASS
pnpm --dir front test:e2e host-club-operations   # Expected: PASS
./server/gradlew -p server test               # Expected: PASS
./server/gradlew -p server architectureTest   # Expected: PASS
```
스킵 시 정확한 명령·이유를 기록한다. **이 게이트를 통과해야 Phase E로 진행한다.**

- [ ] **Step 3: 커밋**

```bash
git add CHANGELOG.md
git commit -m "docs: record host club-operations reinforcement in changelog"
```

---

# PHASE E — Closeout release-readiness 리뷰

> 빌드가 아니라 리뷰 리포트다. `origin/main..HEAD` 누적분(S6 P1·A·B + Phase C·D)을 점검한다. 버전 태그/릴리즈는 하지 않는다. **Phase D 게이트 통과 후 시작한다.**

## Task 16: release-readiness 리뷰 리포트 작성

**Files:**
- Create: `docs/superpowers/reports/2026-05-31-admin-vnext-s6-s9-closeout-readiness.md`
- (필요 시) Modify: `CHANGELOG.md` — 정합 갭이 발견되면 인라인 보정

- [ ] **Step 1: 누적 범위 수집**

```
git fetch origin            # origin/main 최신화
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
```
변경된 표면(프런트/서버/deploy/docs)을 식별한다.

- [ ] **Step 2: release-readiness 룰 점검 (SSOT 적용)**

`docs/development/release-readiness-review.md` 의 각 항목을 `origin/main..HEAD`에 대해 점검하고, **항목별로 통과 / 면책(객관적 이유) / 스킵(이유)** 을 기록한다. 최소:
- CHANGELOG `Unreleased` 정합(동작 변경 누락 없음, 공개 안전 카피).
- CI/deploy 스크립트 변경 영향.
- operator-facing 동작 변경(권한·audit·복구 전이): Phase C(드릴다운, write 없음), Phase D(host read-only projection, host 권한).
- security-code 위생: provider raw error/transcript/member email 비노출, host projection이 admin-only 신호 제외.
- architecture-test 베이스라인/예외: Phase D 서버 경계(`club` 슬라이스 host 컨트롤러 추가).
- 공개 저장소 릴리즈 안전.

- [ ] **Step 3: 공개 릴리즈 후보 스캔 실행**

```
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```
Expected: PASS. 실패 시 사유와 영향을 리포트에 기록하고, 사소한 공개 안전 갭은 인라인 보정 후 재실행한다.

- [ ] **Step 4: 전체 회귀 재확인 (증거 수집)**

```
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
./server/gradlew -p server architectureTest
```
실행한 명령과 결과(통과/스킵+이유)를 리포트 "검증 증거" 절에 그대로 적는다. 실행하지 못한 검증은 **통과로 적지 않는다.**

- [ ] **Step 5: 리포트 작성**

`docs/superpowers/reports/2026-05-31-admin-vnext-s6-s9-closeout-readiness.md` 에 다음 구조로 작성한다:
- **범위**: `origin/main..HEAD` 커밋 목록 요약(S6 P1·A·B + Phase C·D).
- **룰 항목별 결과**: 통과/면책/스킵 표(Step 2 기준).
- **검증 증거**: Step 3·4의 실제 명령·결과.
- **잔여 리스크 & follow-up 후보**: 큰 갭은 별도 follow-up plan으로 분리하고 링크. 사소한 갭은 인라인 보정했음을 명시.
- **결론**: charter §7 S10 재평가 결정 게이트 입력으로서의 판단(증거가 공개 포트폴리오에 쓸 만큼 쌓였는가). **버전 태그/릴리즈는 범위 밖.**

- [ ] **Step 6: 커밋**

```bash
git add docs/superpowers/reports/2026-05-31-admin-vnext-s6-s9-closeout-readiness.md CHANGELOG.md
git commit -m "docs: closeout S6→S9 release-readiness review report"
```

---

## Self-Review 결과 (작성자 점검)

- **Spec 커버리지**:
  - §3.1 Phase C(audit AI 행→ai-ops 드릴다운, health 회귀 가드, 정직한 empty, 서버 변경 0) → Task 1–6.
  - §3.2 Phase D(중립 계약 `front/shared/model/club-operations` 분리, admin SSOT 위임, host-scoped 서버 projection + host 권한, host read-only UI, boundary test) → Task 7–15.
  - §3.3 Phase E(`origin/main..HEAD` 리뷰, 리포트 산출물, 공개 릴리즈 스캔, CHANGELOG 정합, 버전 태그 없음) → Task 16.
  - §1.1 Phase 게이트(순서 강제, Phase 경계 = revert 지점) → Task 6/15가 "다음 Phase로 진행 전 게이트"로 명시.
- **Placeholder 스캔**: Task 14 host e2e의 auth/shell 셋업만 `TODO(executor)`로 남았고, 이는 프로젝트별 host e2e 헬퍼를 차용해야 하는 실제 의존이므로 차용 출처(`host-dashboard*.spec.ts`)와 채울 위치를 명시했다. 그 외 코드 step은 실제 코드 포함.
- **타입 일관성**: `clubAiFailureDelta(aiUsage: ClubAiUsageSummary)` — Task 7 정의 → Task 8 admin 위임 → Task 13 카드에서 동일 시그니처. `HostClubOperationsSnapshot` — Task 7(front) / Task 9(server `toHostSnapshot`) / Task 11(DTO) / Task 12(계약 재노출) / Task 13(카드 props)에서 동일 shape(schema·club{clubId,slug,name}·readiness·sessionProgress·aiUsage). `aiOpsDrilldownForAuditItem`·`aiOpsPathFromFilter` — Task 1/2/3/4 동일 시그니처.
- **경계 안전**: Phase D는 admin·host가 `@/shared/model/club-operations`만 공유(Task 14 경계 테스트로 강제). host UI 카드는 server-state 모듈 import 없이 props로만 데이터 수신.
- **공개 안전**: host projection은 memberActivity·notificationHealth·safeLinks·member email을 제외(Task 9). e2e가 `@example.com`/`ADMIN_ROUTE` 부재를 단언(Task 14). Phase E가 공개 릴리즈 후보 스캔으로 재확인(Task 16).
- **검증 가능한 가정**: Task 10의 `AdminClubOperationsSnapshotPort` SAM 여부와 `AccessDeniedException` 생성자 시그니처는 실행 시 확인하도록 주석으로 명시(불일치 시 조정 지시 포함).
