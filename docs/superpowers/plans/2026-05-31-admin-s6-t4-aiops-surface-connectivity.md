# Slice C (S6-T4) AI Ops 표면 연결성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/audit`의 AI 운영(AI_OPS) 감사 행에서 `/admin/ai-ops?clubId=…` 드릴다운 딥링크를 제공해, 운영자가 감사 신호에서 원인→조치(ai-ops job 필터 뷰)로 한 번에 이동하게 한다.

**Architecture:** 순수 프런트 글루다. 서버 계약 변경 없음 — 감사 행은 이미 `target.clubId`를 노출하고, `/admin/ai-ops`는 이미 `?clubId=`/`?errorCode=` URL 필터(필터 배너 + "전체 보기" + 정직한 empty state)를 받는다. P1 드릴다운 필터 모델(`platform-admin-ai-ops-model.ts`)을 SSOT로 재사용해 outbound 경로 문자열을 만들고, "어떤 감사 행이 링크를 받는가" 결정은 audit 모델의 순수 함수로 분리해 단위 테스트한다. health의 AI provider 카드는 이미 `/admin/ai-ops`로 drill하므로 회귀 가드 assertion만 추가한다.

**Tech Stack:** React + react-router-dom (`Link`), TypeScript, Vitest(@testing-library/react), Playwright e2e. 패키지 루트는 `front/`.

**Scope guardrails (S6/S9 스펙 §5.3 상속):**
- 신규 서버 계약 없음. 기존 audit 응답 키(`target.clubId`)만 사용한다.
- provider raw error / transcript / 생성 결과 JSON / raw member email을 응답·UI·fixture에 노출하지 않는다.
- errorCode 딥링크는 audit 행이 안정적으로 노출하지 않으므로 **clubId 기준 링크만** 만든다(스코프 크리프 방지).
- 새 라우트·새 상태·새 권한 도입 없음.

**검증 명령 (작업 디렉토리는 repo 루트):**
- 단위 테스트(파일 단위): `pnpm --dir front test <path>`
- 린트: `pnpm --dir front lint`
- 빌드: `pnpm --dir front build`
- e2e(파일 단위): `pnpm --dir front test:e2e <spec-file>`

---

## File Structure

- Modify: `front/features/platform-admin/model/platform-admin-ai-ops-model.ts` — outbound 경로 빌더 `aiOpsPathFromFilter` 추가.
- Modify: `front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts` — 빌더 단위 테스트.
- Modify: `front/features/platform-admin/model/platform-admin-audit-model.ts` — `aiOpsDrilldownForAuditItem` 순수 결정 함수 추가.
- Modify: `front/features/platform-admin/model/platform-admin-audit-model.test.ts` — 결정 함수 단위 테스트.
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.tsx` — AuditDetail에 AI Ops 딥링크 렌더.
- Modify: `front/features/platform-admin/ui/admin-audit-ledger.test.tsx` — 딥링크 렌더 단위 테스트(MemoryRouter 래핑).
- Create: `front/tests/e2e/admin-audit-ai-ops-drilldown.spec.ts` — 감사 AI 행 → ai-ops clubId 드릴다운 round-trip + 정직한 empty.
- Modify: `front/tests/e2e/admin-health.spec.ts` — AI provider 카드가 `/admin/ai-ops`로 링크하는지 회귀 assertion.
- Modify: `CHANGELOG.md` — Unreleased Engineering 항목.

---

## Task 1: ai-ops outbound 경로 빌더 `aiOpsPathFromFilter`

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-ai-ops-model.ts`
- Test: `front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts` 의 import 목록에 `aiOpsPathFromFilter` 를 추가하고, 파일 맨 아래에 새 describe 블록을 추가한다.

import 블록 수정 (기존):
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
Expected: FAIL — `aiOpsPathFromFilter is not a function` (또는 import 해결 실패).

- [ ] **Step 3: 최소 구현 추가**

`front/features/platform-admin/model/platform-admin-ai-ops-model.ts` 의 `aiOpsSearchFromFilter` 함수 바로 아래(28번째 줄 `hasActiveAiOpsFilter` 위)에 추가한다:
```ts
export function aiOpsPathFromFilter(filter: AiOpsJobFilter): string {
  const search = aiOpsSearchFromFilter(filter).toString();
  return search ? `/admin/ai-ops?${search}` : "/admin/ai-ops";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --dir front test front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts`
Expected: PASS (신규 3건 포함 전체 통과).

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

`front/features/platform-admin/model/platform-admin-audit-model.test.ts` 의 import 블록을 수정하고 새 describe 블록을 파일 끝에 추가한다.

import 블록 수정 (기존):
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

파일 끝에 추가 (테스트 헬퍼 + 케이스):
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

`front/features/platform-admin/model/platform-admin-audit-model.ts` 상단 import 영역(파일 1번째 줄 위)에 추가한다:
```ts
import {
  EMPTY_AI_OPS_FILTER,
  aiOpsPathFromFilter,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";
```

그리고 `shouldShowAdminAuditDetailValue` 함수 정의 아래(147번째 줄 닫는 `}` 다음)에 추가한다:
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
Expected: PASS — model→model 동일 feature 내부 import는 경계 위반이 아니다. eslint import-cycle/boundary 규칙 위반이 보고되면 멈추고 보고한다(해결 전 진행 금지).

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

`front/features/platform-admin/ui/admin-audit-ledger.test.tsx` 의 import에 `MemoryRouter`를 추가하고, AI_OPS 행을 클릭하면 상세 패널에 ai-ops 링크가 나타나는 테스트를 추가한다.

import 블록 수정 (기존):
```ts
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { AdminAuditLedgerPage } from "@/features/platform-admin/model/platform-admin-audit-model";
import { AdminAuditLedger } from "./admin-audit-ledger";
```

`describe("AdminAuditLedger", ...)` 블록 안, 기존 두 `it` 다음에 추가:
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

`front/features/platform-admin/ui/admin-audit-ledger.tsx` 상단 import에 `Link`와 결정 함수를 추가한다.

1번째 줄 위에 추가:
```ts
import { Link } from "react-router-dom";
```

기존 model import 블록(`labelAdminAuditOutcome`,… 줄들)에 `aiOpsDrilldownForAuditItem`를 추가:
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

`AuditDetail` 함수 안에서 경로를 계산하고 상세 패널 하단에 렌더한다. `const safeMetadata = …` 줄 아래에 추가:
```ts
  const aiOpsPath = aiOpsDrilldownForAuditItem(item);
```

그리고 `{item.metadataState === "EMPTY" ? … }` 줄 **다음**, `</aside>` 닫기 직전에 추가:
```tsx
      {aiOpsPath ? (
        <Link to={aiOpsPath} className="admin-audit__drill">
          AI Ops에서 보기 →
        </Link>
      ) : null}
```

- [ ] **Step 4: 테스트 통과 확인 (신규 + 기존 회귀)**

Run: `pnpm --dir front test front/features/platform-admin/ui/admin-audit-ledger.test.tsx`
Expected: PASS — 신규 1건 + 기존 2건(NOTIFICATION/SUPPORT 행은 AI_OPS가 아니라 링크 미렌더, Router 불필요)이 모두 통과.

- [ ] **Step 5: 커밋**

```bash
git add front/features/platform-admin/ui/admin-audit-ledger.tsx front/features/platform-admin/ui/admin-audit-ledger.test.tsx
git commit -m "feat: link AI_OPS audit detail to ai-ops club drilldown"
```

---

## Task 4: e2e — 감사 AI 행 → ai-ops clubId 드릴다운 round-trip + 정직한 empty

**Files:**
- Create: `front/tests/e2e/admin-audit-ai-ops-drilldown.spec.ts`

- [ ] **Step 1: e2e 스펙 작성 (실패 상태)**

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

- [ ] **Step 2: e2e가 실패하는지 확인 (구현 전이면 통과하지만, 회귀 가드로 실행)**

Task 1–3가 이미 머지된 상태이므로 이 스펙은 통과해야 한다. 구현이 빠졌다면 링크 부재로 FAIL한다.

Run: `pnpm --dir front test:e2e admin-audit-ai-ops-drilldown`
Expected: 2 tests PASS.

- [ ] **Step 3: 커밋**

```bash
git add front/tests/e2e/admin-audit-ai-ops-drilldown.spec.ts
git commit -m "test: cover audit AI_OPS row to ai-ops drilldown e2e"
```

---

## Task 5: health AI provider 카드 → ai-ops 링크 회귀 가드

health의 AI provider 카드는 이미 `/admin/ai-ops`로 drill한다(`AiProviderAvailabilityCardProvider.kt`의 `DRILL`). 연결성이 회귀하지 않도록 기존 health e2e에 href assertion 한 줄을 추가한다(네비게이션은 하지 않아 ai-ops mock 불필요).

**Files:**
- Modify: `front/tests/e2e/admin-health.spec.ts`

- [ ] **Step 1: assertion 추가**

`front/tests/e2e/admin-health.spec.ts` 의 `test("operator views /admin/health grid", …)` 안, `await expect(page.getByText(/NaN/)).toHaveCount(0);` 줄 **앞**에 추가한다:
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

## Task 6: CHANGELOG 갱신 + 전체 회귀 검증

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Unreleased Engineering 항목 추가**

`CHANGELOG.md` 의 `### Engineering` 목록 맨 위(가장 최근 platform-admin 항목 바로 위)에 추가한다:
```markdown
- **platform-admin:** `/admin/audit`의 AI 운영(AI_OPS) 감사 행 상세에 `/admin/ai-ops?clubId=…` 드릴다운 링크를 추가해, 운영자가 감사 신호에서 해당 클럽의 AI job 필터 뷰(원인→조치)로 바로 이동할 수 있게 했습니다. `/admin/health`의 AI provider 카드는 이미 `/admin/ai-ops`로 연결됩니다. 신규 서버 계약 없이 기존 `target.clubId`만 사용하며, P1 필터 모델(`?clubId=`/`?errorCode=`)을 SSOT로 재사용합니다. raw provider error/transcript는 노출하지 않습니다.
```

- [ ] **Step 2: 전체 프런트 회귀 검증**

Run: `pnpm --dir front lint`
Expected: PASS.

Run: `pnpm --dir front test`
Expected: PASS (전체 단위 스위트).

Run: `pnpm --dir front build`
Expected: PASS.

Run: `pnpm --dir front test:e2e admin-audit-ai-ops-drilldown admin-health admin-ai-ops-drilldown admin-audit`
Expected: 모든 관련 e2e PASS.

스킵하는 검사가 있으면 정확한 명령과 이유를 최종 보고에 기록한다.

- [ ] **Step 3: 커밋**

```bash
git add CHANGELOG.md
git commit -m "docs: record admin ai-ops surface connectivity in changelog"
```

---

## Self-Review 결과 (작성자 점검)

- **Spec(§5.3) 커버리지**: health AI 신호→ai-ops(Task 5 회귀 가드, 이미 구현됨), audit AI 신호→ai-ops 드릴다운(Task 1–4), 필터 round-trip 원인→조치(Task 4 test 1), 필터 후 정직한 empty(Task 4 test 2), 신규 서버 계약 최소화(서버 변경 0, clubId 기존 키 사용) — 모두 태스크에 매핑됨.
- **Placeholder 스캔**: 모든 코드 step에 실제 코드 포함. TBD/TODO 없음.
- **타입 일관성**: `aiOpsPathFromFilter(filter: AiOpsJobFilter)` → Task 2/3에서 동일 시그니처로 사용. `aiOpsDrilldownForAuditItem(item: AdminAuditLedgerItem): string | null` → Task 3 UI와 Task 4 e2e에서 동일 동작(AI_OPS + clubId). `AdminAuditLedgerItem`은 audit-model에 이미 export됨.
- **경계 안전**: model→model 동일 feature 내부 import(Task 2 Step 5에서 lint로 확인). UI는 react-router `Link` + MemoryRouter 테스트 패턴(health card와 동일).
- **공개 안전**: fixture는 placeholder만(`@example.com`, `club-1`); raw provider error/transcript 미노출, e2e가 `@example.com`/`{"` 부재를 단언.
