# ADR-0003: Frontend route-first architecture

- 상태: Accepted
- 결정일: 2026-04-23
- 작성자: 프런트엔드 아키텍처
- 관련: ADR-0001 (BFF), ADR-0009 (Zod contract),
  `front/tests/unit/frontend-boundaries.test.ts`,
  `front/src/app/`,
  `front/features/`,
  `front/shared/`,
  `docs/development/architecture.md`

## 컨텍스트

초기 frontend는 기술 레이어로 코드를 분류하는 전통적인 방식을 따랐다:

```
src/
  components/   — UI 컴포넌트
  pages/        — route 컴포넌트
  hooks/        — custom hook
  services/     — API 호출
  utils/        — 유틸리티
  types/        — TypeScript 타입
```

feature가 늘어나면서 다음 문제가 명확히 드러났다:

### 문제 1: Cross-import 사슬 추적 불가

`components/SessionCard.tsx` → `hooks/useSession.ts` → `services/sessionApi.ts` → `utils/dateFormat.ts`처럼 기술 레이어를 가로지르는 import 체인이 3-4단계를 넘으면 "이 컴포넌트를 수정하면 어디까지 영향이 가는가"를 파악하기 어려워진다.

특히 ReadMates는 여러 feature가 비슷한 이름의 hook/service를 가졌다:
- `useSession` — 현재 세션 상태
- `useSessionList` — 세션 목록
- `useHostSession` — 호스트용 세션 상태

이 hook들이 모두 `hooks/` 폴더에 있어 "이 hook이 어느 화면에서 사용되는가"를 추적하기 어려웠다.

### 문제 2: 권한 처리의 분산

세션 상태, 역할별 접근 제어, membership 상태에 따라 화면이 달라지는 ReadMates의 특성상, 권한 판단이 `hooks/`, `utils/`, `components/` 전역으로 분산됐다:

- 일부 화면: route loader에서 redirect 처리
- 일부 화면: component 내 `useEffect`에서 redirect 처리
- 일부 화면: conditional render로 내용만 숨김

이 불일치가 "이 화면에서 role check가 몇 군데 있는가"를 파악하기 어렵게 만들었다.

### 문제 3: API 호출 위치의 불일치

어떤 화면은 route loader에서, 어떤 화면은 component `useEffect`에서, 어떤 화면은 custom hook에서 API를 호출했다. 일관성이 없어 caching, error handling, loading state 처리 방식이 화면마다 달랐다.

### React Router 7 도입과의 연계

React Router 7을 도입하면서 route module 개념이 강화됐다. `loader`, `action`, `Component`를 하나의 route 파일에서 export하는 구조가 "이 route는 어떤 데이터를 필요로 하고, 어떤 mutation을 처리하는가"를 단일 파일에서 파악할 수 있게 한다.

이 결정은 React Router 7 도입과 함께 내려진 frontend 전면 재구조화다.

## 결정

Frontend 코드를 다음 계층으로 정리한다:

```
front/src/app/              — router 설정, layout, auth context, route guard wiring
front/src/pages/            — route 호환 shell (기존 경로 유지 shim 포함)
front/features/<name>/      — 도메인 단위 feature
  api/                      — API 호출 함수, Zod schema, response type
  queries/                  — TanStack Query key, queryOptions, mutation hook, invalidation policy
  model/                    — domain model, type, 순수 계산 함수
  route/                    — React Router route module (loader, action, component)
  ui/                       — presentational component (props + callback만)
front/shared/               — cross-cutting utilities
  api/                      — HTTP client (ReadmatesApiError, client.ts)
  auth/                     — 세션 컨텍스트, membership access
  config/                   — 환경 설정, feature flag
  ui/                       — 공통 UI 컴포넌트 (primitive)
  model/                    — 공통 도메인 타입
  security/                 — safe URL, club slug validation
  routing/                  — route state helper
```

의존 방향 규칙:
- `shared/`는 `features/`, `src/app/`, `src/pages/`를 import할 수 없다.
- `features/<A>/`는 `features/<B>/`를 직접 import할 수 없다.
- `features/<name>/ui/`는 `features/<name>/api/` 또는 `shared/api/`를 import할 수 없다 (presentation이 API 호출 금지).
- `features/<name>/queries/`는 API contract와 shared query primitive를 사용할 수 있지만 UI, route, app, page module을 import하지 않는다.
- `features/<name>/model/`은 React, React Router, API client를 import하지 않는다 (순수 계산만).

이 규칙은 `front/tests/unit/frontend-boundaries.test.ts`로 강제된다.

## 근거

### 라우트가 데이터 흐름의 자연스러운 경계

ReadMates의 화면은 세션 상태, 멤버십, 공개 범위 조합에 따라 매우 다른 데이터를 표시한다. 이 판단이 *어디에서* 이루어지는지가 중요하다. route loader가 이 판단의 자연스러운 위치다:

- `loader`는 route에 진입하기 전에 실행된다. 권한이 없으면 미리 redirect할 수 있다.
- `loader`가 반환하는 데이터가 component props의 source of truth가 된다.
- component는 "무엇을 렌더링할 것인가"만 알면 된다. "어떤 권한에서 보여야 하는가"는 loader의 책임이다.
- API call, error handling, loading state가 route file에 집중된다.

### feature 단위 cohesion

feature 폴더 하나에 `api/queries/model/route/ui`가 함께 있으면:
- 이 feature를 제거할 때 폴더 하나를 삭제하면 된다.
- 신규 멤버가 "이 기능의 코드가 어디에 있는가"를 feature 이름으로 즉시 찾을 수 있다.
- 동일 feature 내 파일들의 import 그래프가 feature 경계 안에서 닫힌다.
- feature 별로 API 호출 함수와 Zod schema(`api/`), server-state freshness와 invalidation(`queries/`), 도메인 모델(`model/`), route module(`route/`), 순수 UI(`ui/`)가 명확히 분리된다.

### import 경계 자동화

`front/tests/unit/frontend-boundaries.test.ts`가 단방향 import 규칙을 검증한다. 이 테스트는 실제 파일 시스템의 import 그래프를 분석하며, 규칙 위반이 CI에서 차단된다.

특히 다음 패턴들이 강제된다:
- shared-to-feature import 차단: `shared/ui/`가 `features/`를 import하면 테스트 실패
- feature 간 직접 import 차단: `features/session/`에서 `features/host/`를 import하면 테스트 실패
- query가 UI/route를 import하는 패턴 차단: `features/<name>/queries/`에서 `features/<name>/ui/` 또는 `features/<name>/route/`를 import하면 테스트 실패
- presentation이 API 호출하는 패턴 차단: `features/<name>/ui/`에서 `shared/api/client`를 import하면 테스트 실패

### shared/의 역할 명확화

`front/shared/`는 어떤 feature도 import하지 않는다. 이 단방향 제약 덕분에:
- shared 파일을 수정할 때 "어떤 feature에 영향이 가는가"를 역방향으로 추적할 수 있다.
- shared가 특정 feature에 결합되지 않아 cross-feature 공유 자산으로 유지된다.
- `shared/api/readmates` compatibility module이 제거될 때 모든 feature의 해당 import를 한 번에 추적 가능했다.

### 실제 폴더 구조 (현재)

```
front/src/app/      — auth-context.tsx, router.tsx, route-guards.tsx, routes/{public,auth,member,host}.tsx 등
front/src/pages/    — route compatibility shells
front/features/     — host/, session/, archive/, member/, club/, ...
front/shared/       — api/, auth/, config/, ui/, model/, security/, routing/
```

## Update 2026-05-14

`front/src/app/router.tsx`는 더 이상 모든 route 정의를 한 파일에 모으지 않는다. variant별 sub-tree가 `front/src/app/routes/{public,auth,member,host}.tsx`로 분리되었고, `router.tsx`는 `createReadmatesRouter()`에서 `QueryClient`를 만들고 `publicRoutes()`/`authRoutes()`/`memberRoutes()`/`hostRoutes(queryClient)` 결과를 합성하는 composition root다. 이 분리는 ADR-0003의 route-first 원칙을 바꾸지 않으며, URL routing matrix, guard wiring, `errorElement`, `lazy()` 경계는 그대로 유지된다. 단지 `src/app` 내부에서도 같은 route-first cohesion을 적용해 변경 영향 범위를 variant 단위로 좁힌다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| Feature-Sliced Design (FSD) 그대로 도입 | FSD는 `entities/`, `widgets/`, `processes/` 같은 추가 레이어를 정의한다. ReadMates의 규모에서는 레이어가 너무 많다. React Router 7의 route module 개념과 FSD의 경계가 겹쳐 혼동을 줄 수 있다. FSD는 Next.js 기반 프로젝트에서 더 자연스럽다. |
| 기존 기술 레이어 유지 (components/hooks/utils) | 이미 cross-import 문제가 드러났다. feature가 늘수록 악화된다. 근본 원인(레이어 간 결합)을 해결하지 않는다. |
| Atomic Design (atoms/molecules/organisms/templates/pages) | UI 계층화에 특화된 패턴이다. 데이터 fetching, 권한 처리, routing 같은 non-UI 코드의 위치를 결정하지 않는다. ReadMates의 핵심 복잡도(권한, 멤버십, 세션 상태)를 처리하기에 부족한 절반의 해결책이다. |
| 도메인 레이어 없이 route-level 코드만 | route 파일이 api 호출 + model 변환 + UI 정의를 모두 담으면 파일이 커진다. 여러 route에서 공유하는 model/api 코드의 위치가 모호해진다. |
| Remix / TanStack Start로 전환 | 전면 프레임워크 교체다. 현재 React Router 7 마이그레이션이 진행 중인 상황에서 추가 교체는 너무 큰 비용이다. |

## 결과

긍정적:
- "이 기능의 코드가 어디에 있는가"를 feature 이름으로 즉시 찾을 수 있다.
- 권한 처리가 route loader에 집중되어 "이 화면에서 role check가 몇 군데 있는가"를 추적하기 쉽다.
- deprecated feature 제거 시 폴더 단위로 제거 가능하다.
- `frontend-boundaries.test.ts`가 CI에서 import 방향을 강제한다.
- presentational component(`ui/`)가 API 호출을 직접 하지 않으므로 UI 단위 테스트에서 실제 API mock이 불필요하다.
- feature 별 Zod schema(`api/`)가 feature 경계 안에 있어 schema 변경 영향 범위가 명확하다.
- React Router 7의 route module pattern(loader/action/component/ErrorBoundary/HydrateFallback export)이 feature 아키텍처와 자연스럽게 일치한다. route file이 feature의 진입점이자 data contract가 된다.
- `shared/` 경계가 명확해 cross-cutting utility(인증 상태, API client, URL helper)가 feature로 누수되지 않는다.

부정적/감수한 비용:
- 작은 feature에도 5개 하위 폴더(`api/queries/model/route/ui`)를 만들어야 한다. 실용적 규칙: route 파일이 1개이고 API call이 없으면 폴더 구조 없이 `features/<name>/index.tsx` 단일 파일로 시작한다.
- feature 간 공유가 필요한 UI 컴포넌트는 `shared/ui/`로 올려야 한다. 이 판단이 반복되면 `shared/ui/`가 비대해질 수 있다.
- `features/` 간 직접 import 금지로 인해, 한 feature가 다른 feature의 상태를 알아야 할 때 URL state 또는 `shared/` 경유가 필요하다.
- legacy `src/pages/` shim이 남아 있어 route URL과 feature 폴더 위치가 완전히 1:1로 대응되지 않는다. 점진적 제거 중.

## 검증

import 경계 테스트:
```bash
pnpm --dir front test -- frontend-boundaries
```

기대: import 경계 규칙 모두 통과. 위반 시 "cannot import from" 메시지와 위반 파일 출력.

전체 frontend 테스트:
```bash
pnpm --dir front test
```

아키텍처 유지 기준:
- 새 feature 추가 시 `features/<name>/ui/` 파일에서 `shared/api/client`를 직접 import하면 경계 테스트 실패.
- `shared/` 파일에서 `features/` 파일을 import하면 경계 테스트 실패.
- `features/<A>/`에서 `features/<B>/`를 직접 import하면 경계 테스트 실패.

## 후속 작업

- feature 간 통신 패턴(URL state, shared context, event 등) 명문화. 현재 URL state를 주로 사용하지만 규칙이 명시되지 않았다.
- `shared/ui/` 비대화 방지 기준: shared/ui에 들어갈 컴포넌트의 기준 문서화.
- feature loader 간 데이터 공유 방식 명문화 (route-level loader composition, parallel loader).
- legacy `src/pages/` shim의 제거 기준 및 일정. 현재 호환성 목적으로만 유지.
- route loader 에러 처리 패턴 명문화: loader가 throw하는 경우와 null/undefined를 반환하는 경우의 차이, `ErrorBoundary` 사용 기준.
- feature 코드 분할 전략: 각 feature의 route module은 lazy load 대상이다. feature 번들 크기 모니터링 기준과 code splitting 설정 문서화.
- `shared/` 패키지 성장 기준: 두 개 이상의 feature가 같은 코드를 사용할 때 `shared/`로 올리는 게 맞는가, 아니면 각 feature에 복사본을 두는 게 맞는가를 판단하는 기준 명문화.
- TypeScript strict mode 경계 강화: 현재 `strict: true`가 전체 frontend에 적용되어 있으나, feature별로 추가 lint rule(import direction, 순환 의존 감지)을 eslint-plugin-import로 강제하는 방안 검토.
- Suspense + Error boundary 패턴 표준화: React Router 7의 loader를 사용할 때 loading state와 error state가 feature마다 다르게 처리된다. feature route module의 `HydrateFallback`, `ErrorBoundary` export 표준 구현 가이드 필요.
- feature 내 상태 관리 패턴 결정: URL state(React Router search params), URL-independent local state(useState), server state(loader data) 각각의 사용 기준을 명문화. 현재 암묵적 관례로만 유지.
- feature 별 Zod schema와 `FrontendZodSchemaContractTest` 커버리지 확대 (ADR-0009 연계).
- optimistic UI 패턴 표준화: React Router 7 action/fetcher API를 사용한 optimistic update가 어느 feature에 적용되었는지 목록화하고, 실패 시 rollback 패턴을 feature 간에 통일.
- `frontend-boundaries.test.ts` 커버리지 확장: 현재 `shared`/`features` 간 import 방향과 feature 내부 `model`/`queries`/`ui`/`route` 경계를 검증한다. route TSX render-only 예외를 더 줄이고, legacy host query/UI 예외를 제거하는 후속 migration이 필요하다.
- feature 단위 번들 크기 모니터링: 각 feature route module의 chunk 크기를 빌드 산출물에서 추적해 의도치 않은 bundle bloat를 조기 발견하는 CI check 추가 검토.
- shared/auth 세션 상태 갱신 전략: 멤버십 상태가 서버에서 변경된 경우 프런트엔드의 `shared/auth` 캐시된 세션 상태가 stale 될 수 있다. polling 또는 server-sent event로 갱신하는 패턴 결정 필요.
- accessibility 표준화: feature 별 UI 컴포넌트가 WCAG 기준을 따르는지 검증. feature 아키텍처에서 `ui/` 컴포넌트가 독립적이어서 accessibility 테스트 대상이 명확하다.
- storybook 도입 검토: `features/<name>/ui/` 내 presentational component가 pure props 기반이어서 story 작성에 적합하다. feature별 UI 문서화 및 시각적 회귀 테스트 방안으로 검토 가능.
- `features/<name>/route/` 파일의 loader 캐시 전략: React Router 7의 clientLoader와 serverLoader 분리 패턴이 도입되면, 각 feature에서 data freshness 정책(stale-while-revalidate, no-cache)을 명시하는 기준 문서화 필요.
