# Admin S6 P1 — AI Ops Failure-Code Drilldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/ai-ops`에서 summary의 실패 코드를 클릭하면 그 코드에 영향받은 클럽/세션(job)으로 job 목록을 필터링하고, 필터를 URL state(`?errorCode=`, `?clubId=`)로 보존하며 "전체 보기"로 해제할 수 있게 한다.

**Architecture:** 순수 frontend 변경이다. 서버 계약과 endpoint(`GET /api/admin/ai-generation/jobs?errorCode=&clubId=`)는 이미 필터를 지원하므로 신규 인프라가 없다. S8 analytics의 URL-state 패턴(`useSearchParams` + model 헬퍼 + loader가 `args.request.url`에서 seeding)을 그대로 재사용한다. route 모듈이 URL→filter→query를 소유하고, UI는 props/callback으로만 렌더링한다.

**Tech Stack:** React + Vite, React Router (`useSearchParams`), TanStack Query, Vitest + Testing Library, Playwright(e2e).

이 plan은 S6 P1만 구현한다. P2(health/audit 연결성), P3(비용/추세), P4(retry 조치)는 포함하지 않는다. 단, URL filter 계약에 `clubId`를 함께 넣어 P2가 deep-link로 재사용할 수 있게 한다(UI 상호작용은 P1에서 실패코드 선택/해제만).

Charter: `docs/superpowers/specs/2026-05-30-admin-vnext-closeout-execution-charter-design.md` §4.2(1). Closeout roadmap §6 S6.

---

## File Structure

- Create: `front/features/platform-admin/model/platform-admin-ai-ops-model.ts` — URL filter 계약과 헬퍼(파싱/직렬화/쿼리 변환). 단일 책임: ai-ops job 필터의 URL state 변환.
- Create: `front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts` — 헬퍼 단위 테스트.
- Modify: `front/features/platform-admin/route/admin-ai-ops-data.ts` — loader가 URL의 필터로 jobs를 seeding.
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.tsx` — `useSearchParams`로 필터 파생, jobs query에 주입, UI에 active filter + 핸들러 전달.
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.test.tsx` — 필터 wiring/URL 갱신 테스트.
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx` — 실패 코드 버튼화, active filter 칩 + "전체 보기" 해제, 필터 적용 시 정직한 empty state.
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx` — 클릭/콜백/empty state 테스트.
- Create: `front/tests/e2e/admin-ai-ops-drilldown.spec.ts` — Playwright happy path.
- Modify: `CHANGELOG.md` — Unreleased에 shipped 동작 기록.

---

## Task 1: URL filter model helpers

**Files:**
- Create: `front/features/platform-admin/model/platform-admin-ai-ops-model.ts`
- Test: `front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EMPTY_AI_OPS_FILTER,
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  aiOpsSearchFromFilter,
  hasActiveAiOpsFilter,
} from "./platform-admin-ai-ops-model";

describe("platform-admin ai-ops filter model", () => {
  it("parses errorCode and clubId from search params", () => {
    const params = new URLSearchParams("errorCode=PROVIDER_RATE_LIMITED&clubId=club-1");
    expect(aiOpsFilterFromSearchParams(params)).toEqual({
      errorCode: "PROVIDER_RATE_LIMITED",
      clubId: "club-1",
    });
  });

  it("treats empty/absent params as null", () => {
    expect(aiOpsFilterFromSearchParams(new URLSearchParams(""))).toEqual(EMPTY_AI_OPS_FILTER);
    expect(aiOpsFilterFromSearchParams(new URLSearchParams("errorCode="))).toEqual(EMPTY_AI_OPS_FILTER);
  });

  it("serializes only set fields, dropping nulls", () => {
    expect(aiOpsSearchFromFilter({ errorCode: "X", clubId: null }).toString()).toBe("errorCode=X");
    expect(aiOpsSearchFromFilter(EMPTY_AI_OPS_FILTER).toString()).toBe("");
  });

  it("reports active filter state", () => {
    expect(hasActiveAiOpsFilter(EMPTY_AI_OPS_FILTER)).toBe(false);
    expect(hasActiveAiOpsFilter({ errorCode: "X", clubId: null })).toBe(true);
    expect(hasActiveAiOpsFilter({ errorCode: null, clubId: "club-1" })).toBe(true);
  });

  it("maps filter to the API query shape, omitting nulls", () => {
    expect(aiOpsFilterToQuery({ errorCode: "X", clubId: null })).toEqual({ errorCode: "X" });
    expect(aiOpsFilterToQuery(EMPTY_AI_OPS_FILTER)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test platform-admin-ai-ops-model`
Expected: FAIL — cannot resolve `./platform-admin-ai-ops-model`.

- [ ] **Step 3: Write minimal implementation**

Create `front/features/platform-admin/model/platform-admin-ai-ops-model.ts`:

```ts
import type { PlatformAdminAiOpsFilters } from "@/features/platform-admin/api/platform-admin-contracts";

export type AiOpsJobFilter = {
  errorCode: string | null;
  clubId: string | null;
};

export const EMPTY_AI_OPS_FILTER: AiOpsJobFilter = { errorCode: null, clubId: null };

export function aiOpsFilterFromSearchParams(params: URLSearchParams): AiOpsJobFilter {
  return {
    errorCode: params.get("errorCode") || null,
    clubId: params.get("clubId") || null,
  };
}

export function aiOpsSearchFromFilter(filter: AiOpsJobFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.errorCode) {
    params.set("errorCode", filter.errorCode);
  }
  if (filter.clubId) {
    params.set("clubId", filter.clubId);
  }
  return params;
}

export function hasActiveAiOpsFilter(filter: AiOpsJobFilter): boolean {
  return Boolean(filter.errorCode || filter.clubId);
}

export function aiOpsFilterToQuery(filter: AiOpsJobFilter): PlatformAdminAiOpsFilters {
  const query: PlatformAdminAiOpsFilters = {};
  if (filter.errorCode) {
    query.errorCode = filter.errorCode;
  }
  if (filter.clubId) {
    query.clubId = filter.clubId;
  }
  return query;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front test platform-admin-ai-ops-model`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-ai-ops-model.ts front/features/platform-admin/model/platform-admin-ai-ops-model.test.ts
git commit -m "feat: add admin ai-ops job filter url model"
```

---

## Task 2: Seed filtered jobs in the route loader

**Files:**
- Modify: `front/features/platform-admin/route/admin-ai-ops-data.ts`

This mirrors `admin-analytics-data.ts`, which reads `args.request.url` and seeds the windowed query. We seed the summary (unfiltered) plus the jobs query for the active URL filter so a deep-linked `?errorCode=...` is warm on first paint.

- [ ] **Step 1: Replace the loader factory implementation**

Replace the entire contents of `front/features/platform-admin/route/admin-ai-ops-data.ts` with:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  EMPTY_AI_OPS_FILTER,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";

export function adminAiOpsLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminAiOps(args?: LoaderFunctionArgs) {
    const filter = args
      ? aiOpsFilterFromSearchParams(new URL(args.request.url).searchParams)
      : EMPTY_AI_OPS_FILTER;
    await Promise.all([
      queryClient.fetchQuery(platformAdminAiOpsSummaryQuery()),
      queryClient.fetchQuery(platformAdminAiOpsJobsQuery(aiOpsFilterToQuery(filter))),
    ]);
    return null;
  };
}
```

- [ ] **Step 2: Run the existing loader/route tests to verify no regression**

Run: `pnpm --dir front test admin-ai-ops`
Expected: PASS (the existing route test still passes — loader signature accepts optional args).

- [ ] **Step 3: Commit**

```bash
git add front/features/platform-admin/route/admin-ai-ops-data.ts
git commit -m "feat: seed admin ai-ops jobs from url filter in loader"
```

---

## Task 3: Drive the jobs query from URL filter in the route

**Files:**
- Modify: `front/features/platform-admin/route/admin-ai-ops-route.tsx`
- Test: `front/features/platform-admin/route/admin-ai-ops-route.test.tsx`

- [ ] **Step 1: Add the failing test**

Append this test inside the existing `describe("AdminAiOpsRoute", ...)` block in `front/features/platform-admin/route/admin-ai-ops-route.test.tsx`. Also update the top `renderRoute` helper to accept an optional initial entry and seed a filtered jobs key. Replace the existing `renderRoute` function and add the new test:

Replace `renderRoute` with:

```tsx
function renderRoute(initialEntry = "/admin/ai-ops") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
    platformRole: "OWNER",
    activeClubCount: 0,
    domainActionRequiredCount: 0,
    domainsRequiringAction: [],
  });
  queryClient.setQueryData(platformAdminAiOpsSummaryQuery().queryKey, {
    activeJobCount: 0,
    failedLast24h: 0,
    monthToDateCostEstimateUsd: "0",
    failureCodes: [{ code: "PROVIDER_RATE_LIMITED", count: 2 }],
    providerCosts: [],
    staleCandidateCount: 0,
  });
  queryClient.setQueryData(platformAdminAiOpsJobsQuery().queryKey, { items: [] });
  queryClient.setQueryData(
    platformAdminAiOpsJobsQuery({ errorCode: "PROVIDER_RATE_LIMITED" }).queryKey,
    { items: [] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminAiOpsRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

Add this import at the top of the test file (with the other query imports):

```tsx
import userEvent from "@testing-library/user-event";
```

Add the new test:

```tsx
  it("selecting a failure code pushes the errorCode filter to the URL", async () => {
    renderRoute();
    await userEvent.click(screen.getByRole("button", { name: /PROVIDER_RATE_LIMITED/ }));
    expect(await screen.findByRole("button", { name: "전체 보기" })).toBeInTheDocument();
  });

  it("renders the active filter banner when navigated with an errorCode", () => {
    renderRoute("/admin/ai-ops?errorCode=PROVIDER_RATE_LIMITED");
    expect(screen.getByText(/PROVIDER_RATE_LIMITED/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체 보기" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test admin-ai-ops-route`
Expected: FAIL — no "전체 보기" button exists yet (UI not wired).

- [ ] **Step 3: Update the route component**

Replace the entire contents of `front/features/platform-admin/route/admin-ai-ops-route.tsx` with:

```tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { PlatformAdminAiOps } from "@/features/platform-admin/ui/platform-admin-ai-ops";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
  useForceCancelPlatformAdminAiJobMutation,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import { platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import {
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  aiOpsSearchFromFilter,
  EMPTY_AI_OPS_FILTER,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";

export function AdminAiOpsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useMemo(() => aiOpsFilterFromSearchParams(searchParams), [searchParams]);
  const role = useQuery(platformAdminSummaryQuery()).data!.platformRole;
  const summaryQuery = useQuery(platformAdminAiOpsSummaryQuery());
  const jobsQuery = useQuery(platformAdminAiOpsJobsQuery(aiOpsFilterToQuery(filter)));
  const forceCancel = useForceCancelPlatformAdminAiJobMutation();

  const disabled = summaryQuery.error instanceof Response && summaryQuery.error.status === 503;

  if (disabled) {
    return (
      <section className="admin-ai-ops admin-ai-ops--disabled" aria-labelledby="admin-ai-ops-title">
        <h1 id="admin-ai-ops-title" className="h1 editorial">AI Ops</h1>
        <div className="admin-ai-ops__disabled-card">
          <p className="eyebrow">운영 정상</p>
          <p className="body">AI generation이 일시 비활성 상태입니다. 활성화되면 작업 큐가 자동으로 다시 채워집니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-ai-ops" aria-labelledby="admin-ai-ops-title">
      <h1 id="admin-ai-ops-title" className="h1 editorial">AI Ops</h1>
      <PlatformAdminAiOps
        role={role}
        summary={summaryQuery.data ?? null}
        jobs={jobsQuery.data?.items ?? []}
        loading={summaryQuery.isLoading || jobsQuery.isLoading}
        error={summaryQuery.error instanceof Error ? summaryQuery.error.message : null}
        onForceCancel={(jobId) => forceCancel.mutate(jobId)}
        activeFilter={filter}
        onSelectFailureCode={(code) =>
          setSearchParams(aiOpsSearchFromFilter({ ...EMPTY_AI_OPS_FILTER, errorCode: code }))
        }
        onClearFilter={() => setSearchParams(aiOpsSearchFromFilter(EMPTY_AI_OPS_FILTER))}
      />
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front test admin-ai-ops-route`
Expected: PASS (existing + 2 new tests). NOTE: this depends on Task 4's UI changes for the "전체 보기" button and clickable failure code; if running tasks strictly in order, Step 4 passes only after Task 4. Run this verification again at the end of Task 4.

- [ ] **Step 5: Commit**

```bash
git add front/features/platform-admin/route/admin-ai-ops-route.tsx front/features/platform-admin/route/admin-ai-ops-route.test.tsx
git commit -m "feat: drive admin ai-ops jobs query from url filter"
```

---

## Task 4: Clickable failure codes, active-filter banner, filtered empty state (UI)

**Files:**
- Modify: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`
- Test: `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`

- [ ] **Step 1: Add failing UI tests**

Append these tests inside the existing `describe("PlatformAdminAiOps", ...)` block in `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`:

```tsx
  it("renders failure codes as buttons and reports selection", async () => {
    const onSelectFailureCode = vi.fn();
    render(
      <PlatformAdminAiOps
        role="OWNER"
        summary={summary}
        jobs={[]}
        onSelectFailureCode={onSelectFailureCode}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /PROVIDER_RATE_LIMITED/ }));
    expect(onSelectFailureCode).toHaveBeenCalledWith("PROVIDER_RATE_LIMITED");
  });

  it("shows an active-filter banner with a clear control", async () => {
    const onClearFilter = vi.fn();
    render(
      <PlatformAdminAiOps
        role="OWNER"
        summary={summary}
        jobs={[]}
        activeFilter={{ errorCode: "PROVIDER_RATE_LIMITED", clubId: null }}
        onClearFilter={onClearFilter}
      />,
    );
    expect(screen.getByText(/PROVIDER_RATE_LIMITED/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "전체 보기" }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it("shows an honest filtered empty state when a filter yields no jobs", () => {
    render(
      <PlatformAdminAiOps
        role="OWNER"
        summary={summary}
        jobs={[]}
        activeFilter={{ errorCode: "PROVIDER_RATE_LIMITED", clubId: null }}
      />,
    );
    expect(screen.getByText("이 필터에 해당하는 AI job이 없습니다.")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test platform-admin-ai-ops.test`
Expected: FAIL — failure codes are list items not buttons; no "전체 보기"; no filtered empty text.

- [ ] **Step 3: Update the UI component**

In `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`:

(a) Extend `PlatformAdminAiOpsProps` (add the three new optional props):

```tsx
type PlatformAdminAiOpsProps = {
  role: PlatformAdminAiOpsRole;
  summary: PlatformAdminAiOpsSummaryView | null;
  jobs: PlatformAdminAiOpsJobView[];
  loading?: boolean;
  error?: string | null;
  onForceCancel?: (jobId: string) => void;
  activeFilter?: { errorCode: string | null; clubId: string | null };
  onSelectFailureCode?: (code: string) => void;
  onClearFilter?: () => void;
};
```

(b) Update the function signature destructuring to include the new props:

```tsx
export function PlatformAdminAiOps({
  role,
  summary,
  jobs,
  loading = false,
  error = null,
  onForceCancel,
  activeFilter,
  onSelectFailureCode,
  onClearFilter,
}: PlatformAdminAiOpsProps) {
  const canAct = role === "OWNER" || role === "OPERATOR";
  const filterActive = Boolean(activeFilter?.errorCode || activeFilter?.clubId);
```

(c) Replace the "Failure codes" `SmallList` usage in the `__sidecars` block with a `FailureCodeList`. The block currently is:

```tsx
      <div className="platform-admin-ai-ops__sidecars">
        <SmallList
          title="Failure codes"
          items={(summary?.failureCodes ?? []).map((item) => `${item.code} ${item.count}`)}
          emptyText="최근 실패 코드 없음"
        />
        <SmallList
          title="Provider cost"
          items={(summary?.providerCosts ?? []).map((item) => `${item.provider} / ${item.model} $${item.costEstimateUsd}`)}
          emptyText="비용 집계 없음"
        />
      </div>
```

Replace it with:

```tsx
      <div className="platform-admin-ai-ops__sidecars">
        <FailureCodeList
          items={summary?.failureCodes ?? []}
          activeCode={activeFilter?.errorCode ?? null}
          onSelect={onSelectFailureCode}
        />
        <SmallList
          title="Provider cost"
          items={(summary?.providerCosts ?? []).map((item) => `${item.provider} / ${item.model} $${item.costEstimateUsd}`)}
          emptyText="비용 집계 없음"
        />
      </div>
```

(d) Add the active-filter banner directly above the `__jobs` block. Insert before `<div className="platform-admin-ai-ops__jobs">`:

```tsx
      {filterActive ? (
        <div className="platform-admin-ai-ops__filter-banner" role="status">
          <span className="tiny muted">
            필터: {activeFilter?.errorCode ?? activeFilter?.clubId}
          </span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => onClearFilter?.()}>
            전체 보기
          </button>
        </div>
      ) : null}
```

(e) Replace the jobs empty branch. The current empty branch is:

```tsx
        ) : (
          <p className="muted platform-admin-domain-empty">표시할 AI job이 없습니다.</p>
        )}
```

Replace with:

```tsx
        ) : (
          <p className="muted platform-admin-domain-empty">
            {filterActive ? "이 필터에 해당하는 AI job이 없습니다." : "표시할 AI job이 없습니다."}
          </p>
        )}
```

(f) Add the `FailureCodeList` component next to the existing `SmallList` helper at the bottom of the file:

```tsx
function FailureCodeList({
  items,
  activeCode,
  onSelect,
}: {
  items: Array<{ code: string; count: number }>;
  activeCode: string | null;
  onSelect?: (code: string) => void;
}) {
  return (
    <div className="surface platform-admin-ai-ops__small-list">
      <p className="tiny muted">Failure codes</p>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.code}>
              <button
                type="button"
                className="platform-admin-ai-ops__failure-code"
                aria-pressed={activeCode === item.code}
                onClick={() => onSelect?.(item.code)}
              >
                {item.code} {item.count}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tiny muted">최근 실패 코드 없음</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run UI tests to verify they pass**

Run: `pnpm --dir front test platform-admin-ai-ops.test`
Expected: PASS (existing + 3 new tests). The existing "shows safe aggregate..." test still finds `PROVIDER_RATE_LIMITED` text (now inside a button).

- [ ] **Step 5: Run the route tests again (Task 3 dependency closes here)**

Run: `pnpm --dir front test admin-ai-ops-route`
Expected: PASS — the "전체 보기" button and clickable failure code now exist.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin/ui/platform-admin-ai-ops.tsx front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx
git commit -m "feat: make admin ai-ops failure codes drill into filtered jobs"
```

---

## Task 5: Playwright e2e — failure-code drilldown happy path

**Files:**
- Create: `front/tests/e2e/admin-ai-ops-drilldown.spec.ts`

Mirrors `admin-analytics.spec.ts`: stub BFF auth/summary/clubs, then stub the ai-ops summary and jobs endpoints, returning a filtered job set when `errorCode` is present.

- [ ] **Step 1: Write the e2e spec**

Create `front/tests/e2e/admin-ai-ops-drilldown.spec.ts`:

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

function job(overrides: Record<string, unknown>) {
  return {
    jobId: "job-1",
    club: { clubId: "club-1", slug: "club-one", name: "Club One" },
    session: { sessionId: "session-1", number: 7, bookTitle: "Book" },
    status: "FAILED",
    stage: null,
    provider: "OPENAI",
    model: "gpt-model",
    errorCode: "PROVIDER_RATE_LIMITED",
    safeErrorMessage: "rate limited",
    costEstimateUsd: "0.1000",
    createdAt: "2026-05-30T00:00:00Z",
    lastUpdatedAt: "2026-05-30T00:01:00Z",
    expiresAt: null,
    staleCandidate: false,
    availableActions: [],
    ...overrides,
  };
}

async function routeAiOps(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/ai-generation/summary", async (route) => {
    await json(route, 200, {
      activeJobCount: 0,
      failedLast24h: 2,
      monthToDateCostEstimateUsd: "0.2000",
      failureCodes: [{ code: "PROVIDER_RATE_LIMITED", count: 2 }],
      providerCosts: [],
      staleCandidateCount: 0,
    });
  });
  await page.route("**/api/bff/api/admin/ai-generation/jobs**", async (route) => {
    const url = new URL(route.request().url());
    const errorCode = url.searchParams.get("errorCode");
    const items = errorCode === "PROVIDER_RATE_LIMITED" ? [job({})] : [];
    await json(route, 200, { items, nextCursor: null });
  });
}

test("owner drills from a failure code into the affected jobs", async ({ page }) => {
  await routeShell(page, "OWNER");
  await routeAiOps(page);

  await page.goto("/admin/ai-ops");

  await expect(page.getByRole("heading", { name: "AI Ops", level: 1 })).toBeVisible();
  await expect(page.getByText("표시할 AI job이 없습니다.")).toBeVisible();

  await page.getByRole("button", { name: /PROVIDER_RATE_LIMITED/ }).click();

  await expect(page).toHaveURL(/errorCode=PROVIDER_RATE_LIMITED/);
  await expect(page.getByText("Club One")).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 보기" })).toBeVisible();

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page).not.toHaveURL(/errorCode=/);

  await expect(page.getByText("@example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `pnpm --dir front test:e2e admin-ai-ops-drilldown`
Expected: PASS. (If the e2e runner needs the full suite invocation, run `pnpm --dir front test:e2e -- admin-ai-ops-drilldown`.)

- [ ] **Step 3: Commit**

```bash
git add front/tests/e2e/admin-ai-ops-drilldown.spec.ts
git commit -m "test: cover admin ai-ops failure-code drilldown e2e"
```

---

## Task 6: CHANGELOG + full verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add a CHANGELOG Unreleased entry**

In `CHANGELOG.md`, under `## Unreleased` → `### Engineering`, add this bullet (describe shipped behavior, no internal plan language):

```markdown
- **platform-admin:** `/admin/ai-ops` failure codes are now drilldown controls. Selecting a failure code filters the job list to the affected clubs/sessions and reflects the filter in URL state (`?errorCode=`), with a "전체 보기" control to clear it. Filtered empty states stay honest ("이 필터에 해당하는 AI job이 없습니다.") and no raw provider error/content fields are exposed.
```

- [ ] **Step 2: Run the full frontend gate**

Run each and confirm PASS:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e admin-ai-ops-drilldown
```

Expected: lint clean, unit tests pass, build succeeds, e2e passes.

- [ ] **Step 3: Public-safety scan of changed files**

Run: `git diff --name-only origin/main..HEAD | xargs grep -nE "@example\.com|OCID|ocid1\.|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}" 2>/dev/null`
Expected: only `@example.com` matches inside `front/tests/e2e/*.spec.ts` (test fixtures, allowed). No tokens/OCIDs/private domains in source or CHANGELOG.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: record admin ai-ops failure-code drilldown in changelog"
```

---

## Verification Gates (charter §8 — S6 subset applicable to P1)

- Contract: frontend `PlatformAdminAiOpsFilters` (errorCode/clubId) drives `GET /api/admin/ai-generation/jobs`; e2e mock reads the same params. No server change.
- Authorization: drilldown is read-only; OWNER/OPERATOR/SUPPORT all view. No new write path.
- Public safety: filtered jobs reuse the existing safe projection (errorCode + safeErrorMessage only); no raw provider error/transcript/result JSON. Verified by Task 6 Step 3 scan and the e2e negative assertions.
- UI: Playwright happy path (Task 5) + filtered/empty unit coverage (Task 4).
- Hardening gate (charter §6) applied to the touched surface: failure codes are keyboard-focusable buttons with `aria-pressed`; banner uses `role="status"`; honest filtered empty state; calm operating-ledger tone reusing existing classes.
- Regression: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `pnpm --dir front test:e2e` (Task 6).

## Out of Scope (later S6 sub-plans)

- P2: health/audit AI 신호 → `/admin/ai-ops` deep-link 연결성 (이 plan이 만든 `?errorCode=`/`?clubId=` URL 계약을 재사용).
- P3: 비용/사용량 윈도우 추세.
- P4: stale job retry 조치(서버 `AiOpsAction.RETRY` + audit).
