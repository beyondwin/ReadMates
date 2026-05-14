# Front Router Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 511줄짜리 `front/src/app/router.tsx` 를 variant 단위 파일로 분해해 PR diff 가독성을 높이고, 향후 영역별 lazy loading 트리를 더 명확히 표현한다.

**Architecture:** route 트리 구조와 lazy() import 동작은 그대로 유지. `routes/public.ts`, `routes/auth.ts`, `routes/member.ts`, `routes/host.ts` 4개 모듈로 분리해 `router.tsx`는 합성만 담당.

**Tech Stack:** React Router 7, Vite 8.

---

## 현재 상태

- `front/src/app/router.tsx` 511줄, variant 5종 (`public`, `auth`, `member` 2개, `host` 2개).
- 각 variant 의 `errorElement`, `RouteErrorBoundary` 사용 (router.tsx:244, 379, 434, 477, 490, 503).
- 이미 `lazy()` 사용 중 (코드 스플리팅 정상).

## 비변경 보증

- URL 라우팅 매트릭스, 가드 (RequireAuth / RequireHost / RequireMemberApp / RequirePlatformAdmin), errorElement 모두 동일.
- e2e 통과로 검증.

---

### Task 1: routes 디렉토리 생성 + 기존 헬퍼 추출

**Files:**
- Create: `front/src/app/routes/public.tsx`

- [ ] **Step 1: 현재 router.tsx 의 public 구간 식별**

```bash
sed -n '230,290p' front/src/app/router.tsx
```

Expected: public route 정의 블록 출력.

- [ ] **Step 2: public route 모듈로 추출**

```tsx
// front/src/app/routes/public.tsx
import type { RouteObject } from "react-router-dom";
import { PublicRouteError } from "@/features/public/route/public-route-state";
import { PublicRouteLayout } from "@/src/app/layouts";
import { RouteErrorBoundary } from "@/src/app/route-error";

export function publicRoutes(): RouteObject {
  return {
    path: "/",
    element: <PublicRouteLayout />,
    errorElement: <RouteErrorBoundary variant="public" />,
    children: [
      // (router.tsx 의 기존 public children 정의를 그대로 이동)
    ],
  };
}
```

> 정확한 children 정의는 `router.tsx:230-379` 의 public 구간 그대로 이동. import 경로 동일.

- [ ] **Step 3: router.tsx 에서 해당 블록을 함수 호출로 치환**

```tsx
// router.tsx
import { publicRoutes } from "./routes/public";

const routes: RouteObject[] = [
  publicRoutes(),
  // auth/member/host는 다음 Task에서
  ...existingOtherRoutes,
];
```

- [ ] **Step 4: lint + unit test + build**

```bash
pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build
```

Expected: 모두 PASS. router.tsx 길이 감소.

- [ ] **Step 5: e2e 회귀 (public 흐름)**

```bash
pnpm --dir front test:e2e --grep public
```

Expected: 기존 public e2e 통과.

- [ ] **Step 6: Commit**

```bash
git add front/src/app/routes/public.tsx front/src/app/router.tsx
git commit -m "refactor(front): extract public routes into routes/public.tsx"
```

---

### Task 2: auth 라우트 추출

**Files:**
- Create: `front/src/app/routes/auth.tsx`
- Modify: `front/src/app/router.tsx`

- [ ] **Step 1: auth 구간 식별 (router.tsx:379 근방 errorElement variant="auth")**

```bash
grep -n 'variant="auth"' front/src/app/router.tsx
```

- [ ] **Step 2: 모듈 추출**

```tsx
// front/src/app/routes/auth.tsx
import type { RouteObject } from "react-router-dom";
import { RouteErrorBoundary } from "@/src/app/route-error";

export function authRoutes(): RouteObject {
  return {
    path: "/auth",
    errorElement: <RouteErrorBoundary variant="auth" />,
    children: [
      // (router.tsx 의 기존 auth children 그대로 이동)
    ],
  };
}
```

- [ ] **Step 3: router.tsx 합성 갱신**

```tsx
import { authRoutes } from "./routes/auth";
const routes: RouteObject[] = [publicRoutes(), authRoutes(), ...rest];
```

- [ ] **Step 4: 검증**

```bash
pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build
pnpm --dir front test:e2e --grep auth
```

Expected: 모두 PASS.

- [ ] **Step 5: Commit**

```bash
git add front/src/app/routes/auth.tsx front/src/app/router.tsx
git commit -m "refactor(front): extract auth routes into routes/auth.tsx"
```

---

### Task 3: member 라우트 추출

**Files:**
- Create: `front/src/app/routes/member.tsx`
- Modify: `front/src/app/router.tsx`

- [ ] **Step 1: member variant 위치 확인 (router.tsx:434, 477)**

```bash
grep -n 'variant="member"' front/src/app/router.tsx
```

Expected: 2개의 member variant 블록 확인.

- [ ] **Step 2: 두 member 블록을 함께 추출**

```tsx
// front/src/app/routes/member.tsx
import type { RouteObject } from "react-router-dom";
import { RouteErrorBoundary } from "@/src/app/route-error";

export function memberRoutes(): RouteObject[] {
  return [
    {
      path: "/app",
      errorElement: <RouteErrorBoundary variant="member" />,
      // ...
    },
    {
      path: "/clubs/:clubSlug/app",
      errorElement: <RouteErrorBoundary variant="member" />,
      // ...
    },
  ];
}
```

- [ ] **Step 3: 합성 갱신 + 검증**

```tsx
const routes: RouteObject[] = [
  publicRoutes(),
  authRoutes(),
  ...memberRoutes(),
  ...rest,
];
```

```bash
pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build
pnpm --dir front test:e2e --grep member
```

Expected: 모두 PASS.

- [ ] **Step 4: Commit**

```bash
git add front/src/app/routes/member.tsx front/src/app/router.tsx
git commit -m "refactor(front): extract member routes into routes/member.tsx"
```

---

### Task 4: host 라우트 추출 + router.tsx 정리

**Files:**
- Create: `front/src/app/routes/host.tsx`
- Modify: `front/src/app/router.tsx`

- [ ] **Step 1: host variant 위치 (router.tsx:490, 503)**

```bash
grep -n 'variant="host"' front/src/app/router.tsx
```

- [ ] **Step 2: host 모듈 추출**

```tsx
// front/src/app/routes/host.tsx
import type { RouteObject } from "react-router-dom";
import { requireHostLoaderAuth } from "@/features/host/route/host-loader-auth";
import { HostRouteError } from "@/features/host/route/host-route-error";
import { RouteErrorBoundary } from "@/src/app/route-error";

export function hostRoutes(): RouteObject[] {
  return [
    // (router.tsx 의 host 두 블록 그대로 이동)
  ];
}
```

- [ ] **Step 3: router.tsx 최종 모습**

```tsx
// router.tsx (≤100줄 목표 — import + 합성 + create 함수 포함)
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { publicRoutes } from "./routes/public";
import { authRoutes } from "./routes/auth";
import { memberRoutes } from "./routes/member";
import { hostRoutes } from "./routes/host";
import { NotFoundRoute } from "./route-error";

export function createReadmatesRouter() {
  const routes: RouteObject[] = [
    publicRoutes(),
    authRoutes(),
    ...memberRoutes(),
    ...hostRoutes(),
    { path: "*", element: <NotFoundRoute /> },
  ];
  return createBrowserRouter(routes);
}

export const router = createReadmatesRouter();
```

- [ ] **Step 4: router.tsx LOC 검증**

```bash
wc -l front/src/app/router.tsx
```

Expected: ≤ 100 줄. (variant 모듈 4개의 import + 합성 함수 + `createBrowserRouter` 호출까지 여유 포함.)

- [ ] **Step 5: 전체 검증**

```bash
pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build
pnpm --dir front test:e2e
```

Expected: 모든 e2e + unit 통과.

- [ ] **Step 6: Commit**

```bash
git add front/src/app/routes/host.tsx front/src/app/router.tsx
git commit -m "refactor(front): extract host routes; router.tsx is now a composition root"
```

---

## Self-Review 체크리스트

- [x] Spec coverage: public(1), auth(2), member(3), host(4)
- [x] Placeholder: children 정의는 "기존을 그대로 이동" — 실제 작업 시 cut/paste 단위로 검증 가능
- [x] Type consistency: 모든 모듈 `RouteObject` 또는 `RouteObject[]` 반환

## Rollback

각 Task가 독립 commit. 회귀 시 역순 revert.

## Out of Scope

- 새 routes 추가 / loader 변경 / lazy 경계 조정은 본 PR 범위 외.
- TanStack Query loader hand-off 는 별도 플랜에서.
