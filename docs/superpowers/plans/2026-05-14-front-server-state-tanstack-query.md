# Front Server-State Migration to TanStack Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버 상태(fetch + cache + invalidation + mutation)를 TanStack Query로 점진 마이그레이션해 `useState/useEffect` 기반 boilerplate를 줄이고 mutation 후 stale 동기화 버그를 구조적으로 제거한다.

**Architecture:** 현재 컴포넌트는 `HostXxxActions` 인터페이스를 props로 주입받아 `Promise<Response>` 를 호출 → useState 로 결과 보관. 이 인터페이스 경계를 보존한 채 컴포넌트 내부의 fetch state machine만 `useQuery`/`useMutation` 으로 치환한다. actions는 그대로 query function으로 재사용 가능 (이미 합성된 함수).

**Tech Stack:** React 19, TanStack Query v5, TypeScript 5.8, React Router 7 (loader 와 공존).

---

## 배경

- 초기 데이터는 React Router `loader` 에서 prop 으로 hand-off (`host-invitations.tsx:74` — `normalizeInvitationPage(initialInvitations)`). 즉 초기 fetch는 이미 loader 책임.
- mutation 이후(create / revoke) 수동으로 `actions.listInvitations({ limit, cursor })` 를 다시 호출해 `useState<HostInvitationListPage>` 를 직접 갱신 (`host-invitations.tsx:127, 147`). 페이지네이션 (`load more`) 도 동일하게 수동.
- 따라서 마이그레이션 가치는 (a) load-more / cursor 페이지 캐싱과 dedup, (b) mutation 후 invalidation 일원화에 있음. "초기 fetch boilerplate 제거" 는 본 화면에서는 해당하지 않음.
- `front/features/host/ui/` 의 `useState` 사용은 mutation/UI 상태가 다수 — 본 plan은 그 중 server-state 부분(invitations list/cursor)만 대상으로 함.
- `react-router-dom@7` 의 `loader`는 초기 데이터만 제공. mutation 이후 caching/invalidation 책임 부재.
- 공식 의존성에 react-query / SWR 없음 (package.json:20-23).

### 비변경 보증

- `Promise<Response>` 를 반환하는 actions 인터페이스는 유지. TanStack Query는 컴포넌트 내부에서만 사용.
- React Router loader 는 그대로 두되 `queryClient.ensureQueryData()` 로 동기화 (initial data hand-off).
- BFF 호출 경로(`/api/bff/...`)와 `readmatesFetch` wrapper는 변경하지 않음.

### 마이그레이션 전략

1. **Phase A (Task 1–4):** QueryClient 도입 + provider 배치 + 첫 read 쿼리(host invitations) 마이그레이션.
2. **Phase B (Task 5–6):** 동 화면의 mutation 마이그레이션 + invalidation 패턴 확립.
3. **Phase C (Task 7):** 나머지 feature는 별도 후속 플랜으로 분리. 본 플랜은 host invitations 한 화면을 "참조 구현"으로 머지하고 종료.

---

### Task 1: TanStack Query 의존성 추가

**Files:**
- Modify: `front/package.json:20-46`

- [ ] **Step 1: 의존성 설치**

```bash
pnpm --dir front add @tanstack/react-query@^5.59.0
pnpm --dir front add -D @tanstack/eslint-plugin-query@^5.59.0
```

Expected: `front/package.json` `dependencies` 에 `@tanstack/react-query`, `devDependencies` 에 `@tanstack/eslint-plugin-query` 추가. `pnpm-lock.yaml` 갱신.

- [ ] **Step 2: 빌드/타입체크 회귀 확인**

```bash
pnpm --dir front build
```

Expected: BUILD SUCCESSFUL. 번들에는 아직 query 코드 미포함 (import 없음).

- [ ] **Step 3: Commit**

```bash
git add front/package.json front/pnpm-lock.yaml
git commit -m "build(front): add @tanstack/react-query dependency"
```

---

### Task 2: QueryClient + Provider 모듈 추가

**Files:**
- Create: `front/src/app/query-client.ts`
- Create: `front/src/app/query-provider.tsx`

- [ ] **Step 1: Query client 작성**

```ts
// front/src/app/query-client.ts
import { QueryClient } from "@tanstack/react-query";
import { ReadMatesSessionExpiredError } from "@/shared/api/client";

export function createReadmatesQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          if (error instanceof ReadMatesSessionExpiredError) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
```

- [ ] **Step 2: Provider 컴포넌트 작성**

```tsx
// front/src/app/query-provider.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type PropsWithChildren } from "react";
import { createReadmatesQueryClient } from "./query-client";

export function ReadmatesQueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(createReadmatesQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 3: main.tsx 에서 provider 부착**

`front/src/main.tsx` 를 읽고 `<RouterProvider />` 를 `<ReadmatesQueryProvider>` 로 감싼다.

```tsx
// front/src/main.tsx 의 RouterProvider 라인을 다음으로 교체
import { ReadmatesQueryProvider } from "@/src/app/query-provider";

// ...
<ReadmatesQueryProvider>
  <RouterProvider router={router} />
</ReadmatesQueryProvider>
```

- [ ] **Step 4: 빌드 + 기존 테스트 회귀**

```bash
pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build
```

Expected: 모두 통과. 어떤 query/mutation도 아직 사용되지 않으므로 동작 변경 없음.

- [ ] **Step 5: Commit**

```bash
git add front/src/app/query-client.ts front/src/app/query-provider.tsx front/src/main.tsx
git commit -m "feat(front): wire QueryClientProvider at app root"
```

---

### Task 3: Query key factory + invitation queries 모듈

**Files:**
- Create: `front/features/host/queries/host-invitation-queries.ts`

- [ ] **Step 1: queries 모듈 작성**

```ts
// front/features/host/queries/host-invitation-queries.ts
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import type { HostInvitationListPage } from "@/features/host/api/host-contracts";
import {
  listHostInvitationsResponse,
  parseHostInvitationListResponse,
} from "@/features/host/api/host-api";
import type { PageRequest } from "@/shared/model/paging";

export const hostInvitationKeys = {
  all: ["host", "invitations"] as const,
  list: (page?: PageRequest) =>
    [...hostInvitationKeys.all, "list", page ?? {}] as const,
} as const;

async function fetchHostInvitationList(page?: PageRequest): Promise<HostInvitationListPage> {
  const response = await listHostInvitationsResponse(page);
  return parseHostInvitationListResponse(response);
}

export function hostInvitationListQuery(page?: PageRequest) {
  return queryOptions({
    queryKey: hostInvitationKeys.list(page),
    queryFn: () => fetchHostInvitationList(page),
  });
}

export function invalidateHostInvitations(client: QueryClient) {
  return client.invalidateQueries({ queryKey: hostInvitationKeys.all });
}
```

> 시그니처 사실관계 (검증 결과):
> - `front/features/host/api/host-api.ts:310` — `listHostInvitationsResponse(context?, page?)` 는 `PageRequest` 를 받음.
> - `front/features/host/actions/invitations.ts` — `listInvitations()` 래퍼는 인자 없이 underlying 호출. 컴포넌트는 `actions.listInvitations({ limit: 50 })` / `({ limit: 50, cursor })` 형태(host-invitations.tsx:127, 147)로 호출하므로 actions 래퍼 자체에 `page?` 인자가 사실상 필요.
> - 본 plan은 actions 래퍼 시그니처를 `listInvitations(page?: PageRequest)` 로 명시화하고, query factory도 `page` 를 받아 key 와 fetcher 양쪽에 전달. underlying API 변경 없음.

- [ ] **Step 2: 시그니처 검증**

```bash
grep -n "listHostInvitationsResponse" front/features/host/api/host-api.ts
```

Expected: 함수 시그니처 확인. 페이지 인자가 없다면 `hostInvitationListQuery()` 도 인자 제거.

- [ ] **Step 3: 타입체크**

```bash
pnpm --dir front exec tsc -p tsconfig.json --noEmit
```

Expected: 0 error.

- [ ] **Step 4: Commit**

```bash
git add front/features/host/queries/host-invitation-queries.ts
git commit -m "feat(host): add TanStack query options for invitations list"
```

---

### Task 4: host-invitations.tsx 의 list 읽기를 useQuery 로 치환

**Files:**
- Modify: `front/features/host/ui/host-invitations.tsx`

- [ ] **Step 1: 기존 list 로드 로직 식별**

```bash
grep -n "listInvitations\|useState.*Page\|useEffect" front/features/host/ui/host-invitations.tsx | head -20
```

Expected: list state, load effect 위치 파악.

- [ ] **Step 2: 실패 단위 테스트 추가**

`front/tests/unit/host-invitations.test.tsx` 의 기존 테스트가 actions props mock 으로 동작. 새 query 동작을 검증하려면 QueryClientProvider wrapper 가 필요. 다음 헬퍼를 추가:

```tsx
// front/tests/unit/helpers/query-test-wrapper.tsx (Create)
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

export function createTestQueryWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}
```

`host-invitations.test.tsx` 에 추가 시나리오:

```tsx
import { createTestQueryWrapper } from "./helpers/query-test-wrapper";

it("loads invitation list via useQuery", async () => {
  const { Wrapper } = createTestQueryWrapper();
  const actions = createMockHostInvitationsActions(); // 기존 테스트 헬퍼 재사용
  render(<HostInvitations actions={actions} />, { wrapper: Wrapper });
  expect(await screen.findByText(/대기/)).toBeInTheDocument();
  expect(actions.listInvitations).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: 테스트 실행 (fail 확인)**

```bash
pnpm --dir front test -- host-invitations
```

Expected: FAIL — 컴포넌트는 아직 useQuery 미사용.

- [ ] **Step 4: 컴포넌트 마이그레이션**

`host-invitations.tsx` 내 list 관련 `useState`/`useEffect` 블록을 다음으로 교체:

```tsx
import { useQuery } from "@tanstack/react-query";
import { hostInvitationListQuery } from "@/features/host/queries/host-invitation-queries";

// 컴포넌트 본문 상단
const listQuery = useQuery({
  ...hostInvitationListQuery(),
  // actions가 주입되는 경우 query function override (테스트 용이성)
  queryFn: async () => {
    const response = await actions.listInvitations();
    return actions.parseInvitationList(response);
  },
});

const invitations = listQuery.data?.items ?? [];
const isLoading = listQuery.isLoading;
const loadError = listQuery.error;
```

- [ ] **Step 5: 테스트 재실행**

```bash
pnpm --dir front test -- host-invitations
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add front/features/host/ui/host-invitations.tsx \
        front/tests/unit/host-invitations.test.tsx \
        front/tests/unit/helpers/query-test-wrapper.tsx
git commit -m "refactor(host): use TanStack useQuery for invitation list"
```

---

### Task 5: useMutation 도입 + optimistic invalidation

**Files:**
- Modify: `front/features/host/ui/host-invitations.tsx`
- Modify: `front/features/host/queries/host-invitation-queries.ts`

- [ ] **Step 1: revoke/create mutation hook 추가 (queries 모듈)**

```ts
// host-invitation-queries.ts 에 추가
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createHostInvitation,
  revokeHostInvitation,
  parseHostInvitationResponse,
} from "@/features/host/api/host-api";
import type { CreateHostInvitationRequest } from "@/features/host/api/host-contracts";

export function useCreateInvitationMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateHostInvitationRequest) => {
      const response = await createHostInvitation(request);
      return parseHostInvitationResponse(response);
    },
    onSuccess: () => invalidateHostInvitations(client),
  });
}

export function useRevokeInvitationMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await revokeHostInvitation(invitationId);
      return parseHostInvitationResponse(response);
    },
    onSuccess: () => invalidateHostInvitations(client),
  });
}
```

- [ ] **Step 2: 실패 테스트 추가**

`host-invitations.test.tsx`:

```tsx
it("invalidates list after successful revoke", async () => {
  const { Wrapper } = createTestQueryWrapper();
  const actions = createMockHostInvitationsActions();
  render(<HostInvitations actions={actions} />, { wrapper: Wrapper });
  await screen.findByText(/대기/);

  await userEvent.click(screen.getByRole("button", { name: /취소/ }));
  await screen.findByText(/취소된 링크/);

  expect(actions.listInvitations).toHaveBeenCalledTimes(2); // initial + after invalidate
});
```

- [ ] **Step 3: fail 확인**

```bash
pnpm --dir front test -- host-invitations
```

Expected: FAIL.

- [ ] **Step 4: 컴포넌트 내 revoke/create 콜백을 mutation hook 으로 치환**

```tsx
const createMutation = useCreateInvitationMutation();
const revokeMutation = useRevokeInvitationMutation();

async function handleCreate(request: CreateHostInvitationRequest) {
  await createMutation.mutateAsync(request);
}

async function handleRevoke(invitationId: string) {
  await revokeMutation.mutateAsync(invitationId);
}
```

기존 수동 refetch 호출 라인은 제거 (`onSuccess` 가 invalidate).

- [ ] **Step 5: 테스트 통과 확인**

```bash
pnpm --dir front test -- host-invitations
```

Expected: PASS.

- [ ] **Step 6: e2e 회귀 (host 흐름)**

```bash
pnpm --dir front test:e2e --grep host
```

Expected: 기존 host invitations e2e 통과.

- [ ] **Step 7: Commit**

```bash
git add front/features/host/ui/host-invitations.tsx \
        front/features/host/queries/host-invitation-queries.ts \
        front/tests/unit/host-invitations.test.tsx
git commit -m "refactor(host): use useMutation+invalidation for invitations"
```

---

### Task 6: React Router loader 와의 hand-off 패턴 확립

**Files:**
- Modify: `front/features/host/route/host-loader-auth.ts` (또는 invitations loader가 있다면 해당 파일)

- [ ] **Step 1: invitations route loader 위치 식별**

```bash
grep -rn "invitations" front/src/app/router.tsx front/features/host/route 2>/dev/null
```

Expected: invitations route 정의 파일 경로 확인.

- [ ] **Step 2: loader 에서 QueryClient 주입**

QueryClient 인스턴스를 module-scoped singleton 으로 두면 HMR/테스트 격리 시 leakage 위험이 있다. 대신 router 생성 시점에 한 번 만들고 loader / provider 가 같은 인스턴스를 명시적으로 공유하는 구조로 변경:

```ts
// front/src/app/router.tsx 의 createReadmatesRouter 변경
import { createReadmatesQueryClient } from "./query-client";
import { hostInvitationsLoader } from "@/features/host/route/host-invitations-loader";

export function createReadmatesRouter() {
  const queryClient = createReadmatesQueryClient();

  const routes: RouteObject[] = [
    /* ... */
    // host invitations route definition 에서:
    // loader: hostInvitationsLoader(queryClient),
  ];

  const router = createBrowserRouter(routes);
  return { router, queryClient };
}
```

loader 는 closure 로 client 를 캡처:

```ts
// front/features/host/route/host-invitations-loader.ts
import type { QueryClient } from "@tanstack/react-query";
import { hostInvitationListQuery } from "@/features/host/queries/host-invitation-queries";

export function hostInvitationsLoader(client: QueryClient) {
  return async () => {
    await client.ensureQueryData(hostInvitationListQuery());
    return null; // 데이터는 cache 에서 query 가 즉시 hit
  };
}
```

- [ ] **Step 3: provider 가 같은 인스턴스를 사용하도록 수정**

```tsx
// front/src/main.tsx
const { router, queryClient } = createReadmatesRouter();

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
```

> Task 2 에서 만든 `ReadmatesQueryProvider` 는 더 이상 필요하지 않으므로 본 단계에서 제거하거나, useState 캐시 대신 인자로 client 를 받는 형태로 축소. test wrapper(`createTestQueryWrapper`) 는 자체 QueryClient 를 그대로 생성 — 격리 보존.

- [ ] **Step 4: 테스트 및 e2e 재실행**

```bash
pnpm --dir front lint && pnpm --dir front test
pnpm --dir front test:e2e --grep host
```

Expected: 모두 PASS. 초기 로딩 spinner 없이 데이터 즉시 표시.

- [ ] **Step 5: Commit**

```bash
git add front/src/app/query-provider.tsx \
        front/features/host/route/ \
        front/src/app/router.tsx
git commit -m "feat(host): hand off router loader data to TanStack cache"
```

---

### Task 7: 마이그레이션 진행 추적 문서

**Files:**
- Create: `docs/development/server-state-migration.md`

- [ ] **Step 1: 문서 작성**

```markdown
# Server State Migration Status

본 문서는 TanStack Query 마이그레이션 진행 상황을 추적합니다.

## 완료
- `host/invitations` — list query + create/revoke mutation + loader hand-off

## 패턴
- query: `features/<feature>/queries/<area>-queries.ts` 에 `queryOptions` + `useXxxMutation` export
- query key: `[feature, area, op, params]` 형태 const tuple
- mutation: `onSuccess` 에서 `invalidateQueries({ queryKey: keys.all })`
- 컴포넌트는 actions props 인터페이스를 유지 — 테스트는 wrapper + mock actions 로 동일하게 작성

## 후속 후보 (우선순위)
1. `host/members`
2. `host/sessions`
3. `host/notifications`
4. `current-session` (actions 4개)
5. `archive`, `feedback`, `public` — 읽기 중심, loader 와 결합도 높음
```

- [ ] **Step 2: Commit**

```bash
git add docs/development/server-state-migration.md
git commit -m "docs(front): track TanStack server-state migration"
```

---

## Self-Review 체크리스트

- [x] Spec coverage: 의존성(1), provider(2), query factory(3), useQuery(4), useMutation(5), loader hand-off(6), 문서(7)
- [x] Placeholder: 없음. 단, Task 5의 "예: 취소 버튼 click + 취소된 링크 표시" 셀렉터는 실제 테스트 진입 시 기존 `host-invitations.test.tsx` 의 query 패턴에 맞춰야 함 — 동일 테스트 파일 내 기존 selector 재사용을 명시.
- [x] Type consistency: `HostInvitationListPage`, `CreateHostInvitationRequest`, `hostInvitationKeys`, `hostInvitationListQuery` 명명 일관.

## Rollback

각 Task가 독립 PR / 독립 commit. 회귀 시 Task 4~6 까지 revert 후 Task 1~3만 유지하면 의존성과 provider 만 남고 동작 영향 없음.

## Out of Scope

- 다른 feature(`host/members` 등) 마이그레이션은 후속 플랜.
- Optimistic update (`onMutate` 롤백) 는 본 PR 범위 외. invalidation-on-success 로 시작.
- Suspense 통합은 본 PR 범위 외.
