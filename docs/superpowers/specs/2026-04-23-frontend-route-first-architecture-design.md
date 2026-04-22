# Frontend Route-First Architecture Design

작성일: 2026-04-23
상태: VALIDATED DESIGN SPEC
문서 목적: ReadMates 프런트엔드를 React Router 7 중심의 route-first feature architecture로 표준화하기 위한 설계 기준과 전체 리팩터링 전환 계획을 정의한다.

## 1. 문서 범위

이 문서는 ReadMates 프런트엔드의 구조 표준화를 다룬다.

- React Router 7 중심의 route, loader, action, error boundary 기준
- feature별 `api`, `model`, `ui`, `route` 경계
- shared platform 계층의 책임
- import 방향과 dependency boundary 규칙
- 서버 상태, mutation, 에러 처리 표준
- 전체 리팩터링 전환 순서
- 테스트와 품질 가드레일

이 문서는 아래 범위를 다루지 않는다.

- 시각 디자인 재설계
- 백엔드 클린 아키텍처 변경
- API 스펙 자체의 제품 기능 변경
- TanStack Query, 상태관리 라이브러리, 디자인 시스템 패키지 신규 도입
- 네이티브 앱 또는 SSR/React Server Components 전환

## 2. 현재 프런트 상태 진단

현재 프런트는 무질서한 상태가 아니다. `src/app`, `src/pages`, `features`, `shared`로 이미 큰 축이 나뉘어 있고, 공용 UI, 디자인 토큰, unit/e2e 테스트도 존재한다.

확인된 강점:

- `front/package.json` 기준 Vite, React 19, React Router 7, TypeScript strict, Vitest, Playwright 기반이다.
- `front/AGENTS.md`에 제품 사용자, 브랜드, 디자인 원칙이 명확히 정리되어 있다.
- `shared/ui`, `shared/styles`, `features/*/components`, `features/*/actions`, `src/pages` 분리가 이미 시작되어 있다.
- route별 unit test와 주요 e2e test가 있어 점진적 리팩터링 검증 기반이 있다.

개선이 필요한 부분:

- `front/shared/api/readmates.ts`가 API 타입, HTTP primitive, response helper를 한 파일에 모으고 있어 변경 영향 범위가 커진다.
- `front/features/host/components/host-dashboard.tsx`, `front/features/host/components/host-session-editor.tsx`, `front/features/archive/components/archive-page.tsx`, `front/features/current-session/components/current-session.tsx` 같은 큰 파일은 UI, 파생 상태, 도메인 판단, 이벤트 처리가 섞여 있다.
- `front/src/pages/readmates-page-data.ts`는 수동 `useEffect` 기반 route data hook을 제공하지만, React Router 7의 loader/action/revalidation 모델과 중복된다.
- import 방향은 대체로 `pages -> features -> shared`지만 자동으로 강제되지 않는다.
- feature 간 직접 import와 shared 승격 기준이 명문화되어 있지 않다.

## 3. 확정된 접근안

선택한 접근은 `Route-First Feature Architecture`다.

이 방식은 서버 클린 아키텍처의 이름을 프런트에 그대로 복사하지 않는다. 대신 프런트의 실제 변경 단위인 route, data loading, mutation, feature UI, 화면 모델을 중심으로 경계를 세운다.

### 3.1 채택한 방향

- React Router 7을 route data와 mutation의 표준으로 삼는다.
- route module은 loader, action, error boundary, page boundary를 담당한다.
- feature 내부는 `api`, `model`, `ui`, `route`로 나눈다.
- shared 계층은 앱 전역 primitive만 제공한다.
- TanStack Query는 지금 도입하지 않는다.
- 서버 response 변경의 영향 범위를 feature `api`와 `model` 근처로 제한한다.

### 3.2 기각한 방향

`Feature-Sliced Design` 스타일은 `app / pages / widgets / features / entities / shared`처럼 더 세밀한 계층을 제공하지만, 현재 ReadMates 규모에서는 계층 수가 많아 마이그레이션 비용이 커진다.

서버식 `domain / application / infrastructure / presentation` 구조를 프런트에 그대로 이식하는 방식은 개념적으로 익숙하지만 React route, form, UI state, user interaction과 잘 맞지 않아 코드가 장황해질 위험이 있다.

TanStack Query 중심 접근은 polling, background refresh, shared cache, offline, 복잡한 invalidation이 핵심일 때 강하다. 현재 ReadMates는 route 중심의 문서형 업무 앱에 가까우므로 새 상태 표준을 추가하는 비용이 더 크다.

## 4. 목표 구조

최종 구조의 기준은 다음과 같다.

```text
front/
  src/
    app/
      router.tsx
      layouts.tsx
      route-guards.tsx
      auth-context.tsx
      auth-state.ts
    pages/
      current-session.tsx
      host-dashboard.tsx
      archive.tsx
  features/
    current-session/
      api/
        current-session-api.ts
        current-session-contracts.ts
      model/
        current-session-view-model.ts
        current-session-form-model.ts
      route/
        current-session-route.tsx
      ui/
        current-session-page.tsx
        current-session-empty.tsx
        current-session-board.tsx
        current-session-panels.tsx
        current-session-mobile.tsx
      index.ts
    host/
    archive/
    public/
    auth/
    feedback/
  shared/
    api/
      client.ts
      errors.ts
      response.ts
    ui/
    styles/
    security/
    lib/
```

`src/pages`는 compatibility route shell로 남길 수 있다. 장기적으로 각 page는 `features/*/route`에 있는 route module을 re-export하거나 얇게 위임한다.

## 5. 의존 방향 규칙

기본 의존 방향은 아래와 같다.

```text
src/app -> src/pages -> features -> shared
```

규칙:

- `shared`는 `features`, `src/pages`, `src/app`을 import하지 않는다.
- feature끼리는 직접 import하지 않는다.
- feature 간 공유가 필요하면 `shared`로 승격하거나, 정말 feature 공개 API가 필요한 경우 해당 feature의 `index.ts`에서 명시적으로 export한다.
- `features/<name>/ui`는 `fetch`, `readmatesFetch`, route loader/action, global auth provider를 직접 알지 않는다.
- `features/<name>/model`은 React, React Router, DOM API를 import하지 않는다.
- `features/<name>/api`는 endpoint 호출과 request/response contract만 담당한다.
- `src/app`은 provider, router, layout, guard, app-wide wiring만 담당한다.
- `src/pages`는 route 진입점과 compatibility shell만 담당한다.

자동 검증 기준:

- Phase 0에서는 dependency-boundary unit test를 먼저 추가해 금지 import를 감지한다.
- ESLint custom rule은 필요할 때 후속 단계로 도입한다.
- 금지 대상은 `shared -> features`, `shared -> src/pages`, `feature A -> feature B`, `feature/ui -> feature/api`, `feature/model -> react`, `feature/model -> react-router-dom`이다.

## 6. 데이터 흐름

ReadMates 프런트의 표준 데이터 흐름은 다음과 같다.

```text
Route loader
  -> feature/api client
  -> feature/model mapper
  -> route component
  -> feature/ui component

User action
  -> route action
  -> feature/api mutation
  -> route revalidation
  -> loader rerun
  -> UI update
```

각 계층의 책임:

- `shared/api/client.ts`: `readmatesFetch`, `readmatesFetchResponse`, `ReadmatesApiError`, JSON parse helper, unauthorized handling 같은 HTTP primitive만 제공한다.
- `features/<name>/api/*.ts`: 해당 feature의 endpoint만 호출한다.
- `features/<name>/model/*.ts`: API response를 화면 모델로 바꾼다. 파생 상태, label, permission-derived state, form validation 같은 순수 계산을 둔다.
- `features/<name>/route/*.tsx`: loader/action에서 API와 model을 호출하고, UI에 props로 넘긴다.
- `features/<name>/ui/*.tsx`: props와 callback을 받아 렌더링한다.

`front/src/pages/readmates-page-data.ts`는 route loader 전환 전 compatibility layer로만 사용한다. 최종 상태에서는 route loader/action과 route error boundary로 대체한다.

## 7. Mutation 규칙

mutation은 두 종류로 나눈다.

### 7.1 Route-scoped mutation

route 데이터와 직접 연결되는 변경은 React Router action을 기본값으로 한다.

대상 예시:

- RSVP 변경
- 체크인 저장
- 질문 저장
- 한줄평/장문 서평 저장
- 호스트 세션 생성/수정
- 출석 확정
- 공개 기록 발행
- 피드백 문서 업로드
- 초대 생성/회수
- 멤버 상태 변경

저장 후에는 route revalidation을 통해 loader 결과를 다시 기준으로 삼는다.

feature action 파일이 필요한 경우에는 UI에서 직접 호출하지 않는다. route action 또는 compatibility route shell이 호출하는 mutation helper로만 사용한다.

### 7.2 Component-local interaction state

서버와 무관한 상태는 UI component 안에 둔다.

대상 예시:

- 탭 선택
- 입력 중인 textarea 값
- 임시 validation message
- 모바일 panel 상태
- 확장/접힘 상태
- hover/focus에 가까운 purely presentational state

### 7.3 Optimistic UI

낙관적 UI는 제한적으로 허용한다.

- RSVP처럼 실패 시 이전 값으로 되돌리기 쉬운 단일 필드에는 허용한다.
- 질문, 서평, 세션 편집처럼 데이터 손실 가능성이 있는 입력은 저장 중, 저장됨, 실패 상태를 명확히 보여주고 revalidation 결과를 기준으로 확정한다.

## 8. 에러 처리 규칙

HTTP 상태별 기본 처리는 다음과 같다.

| 상태 | 처리 |
| --- | --- |
| 401 | 로그인 redirect 또는 route guard 처리 |
| 403 | 권한 없음 route state 또는 feature-specific locked state |
| 404 | route error boundary에서 기록 없음 상태 |
| 409 | conflict form state 또는 안내 문구 |
| 422 | field/form validation state |
| 5xx/network | route-level retry affordance |

`shared/api`는 원본 response를 숨기지 않고 `ReadmatesApiError` 같은 구조화된 에러로 변환할 수 있어야 한다. feature route/action은 이 에러를 화면 상태로 바꾼다.

## 9. 전체 리팩터링 전환 계획

### Phase 0. 규칙과 가드레일

- 이 문서를 기준으로 프런트 아키텍처 규칙을 확정한다.
- import 방향 규칙을 dependency-boundary unit test로 강제한다.
- 기존 dirty worktree나 기능 변경과 섞지 않고 구조 변경 commit을 분리한다.

완료 조건:

- 금지 import 목록이 코드 또는 테스트로 표현되어 있다.
- 새 feature 작성자가 `api`, `model`, `ui`, `route` 위치를 판단할 수 있다.

### Phase 1. API 계층 분리

- `front/shared/api/readmates.ts`를 공통 HTTP client와 feature별 contract로 나눈다.
- 처음에는 호환 export layer를 둬서 전체 변경 폭을 줄인다.
- 새 코드는 feature API에서만 endpoint를 호출한다.

완료 조건:

- 공통 fetch primitive는 `shared/api`에 있다.
- current-session, host, archive, public, auth, feedback 중 최소 하나 이상이 feature API를 사용한다.
- 기존 tests가 통과한다.

### Phase 2. 기준 feature 전환

첫 기준 feature는 `current-session`으로 한다.

이유:

- 읽기와 쓰기가 모두 있다.
- validation, save status, RSVP, 모바일/데스크톱 UI, route refresh가 모두 포함된다.
- 이 feature를 정리하면 이후 host/archive 전환의 기준 코드가 된다.

목표 구조:

```text
features/current-session/
  api/current-session-api.ts
  api/current-session-contracts.ts
  model/current-session-view-model.ts
  model/current-session-form-model.ts
  route/current-session-route.tsx
  ui/current-session-page.tsx
  ui/current-session-empty.tsx
  ui/current-session-board.tsx
  ui/current-session-panels.tsx
  ui/current-session-mobile.tsx
  index.ts
```

완료 조건:

- route data loading은 React Router loader/action 또는 그에 맞춘 route module에 모인다.
- current-session UI는 fetch를 직접 import하지 않는다.
- 파생 상태와 validation은 model 순수 함수 테스트를 가진다.
- 기존 current-session unit/e2e coverage가 유지된다.

### Phase 3. Host feature 전환

대상:

- `host-dashboard`
- `host-session-editor`
- `host-members`
- `host-invitations`

host feature는 운영 판단과 permission-derived state가 많으므로 model 분리 효과가 크다.

완료 조건:

- dashboard checklist, next action, session phase 같은 파생 판단은 model로 이동한다.
- editor form default, schedule normalization, validation은 model로 이동한다.
- host UI는 props와 callback 중심으로 단순화된다.

### Phase 4. Archive, public, auth, feedback 전환

archive:

- archive list, notes feed, my page의 filtering/sorting/display model을 분리한다.

public:

- 공개 홈, 공개 기록, 공개 세션 상세의 public contract와 display model을 분리한다.

auth:

- invite, login, pending approval, logout flow를 auth feature API/route/UI로 정리한다.

feedback:

- feedback document response를 읽기 화면 모델로 감싸 UI를 단순화한다.

완료 조건:

- 각 feature에 `api`, `model`, `ui`, `route` 또는 해당 feature에 필요한 최소 subset이 있다.
- feature 간 직접 import가 없다.

### Phase 5. Compatibility 제거

- `src/pages/*.tsx`는 얇은 route shell 또는 feature route re-export로만 남긴다.
- `useReadmatesData` 기반 수동 fetch를 제거한다.
- 모든 route가 loader/action/error boundary 규칙을 따른다.

완료 조건:

- route-level loading/error 처리 경로가 일관된다.
- page에서 data fetching과 화면 모델 계산이 사라진다.
- 전체 lint, unit, e2e가 통과한다.

## 10. 테스트 기준

### 10.1 Model tests

React 없이 순수 함수로 테스트한다.

대상 예시:

- `sessionPhase`
- `buildHostChecklist`
- current-session question validation
- archive filter/sort
- permission-derived UI state
- feedback document display model

### 10.2 API tests

fetch mock으로 path, method, body, error handling을 확인한다.

기존 `front/tests/unit/readmates-fetch.test.ts` 스타일을 feature API로 확장한다.

### 10.3 Route tests

loader/action이 올바른 API를 호출하고, 401/403/404/409/422를 route state 또는 error boundary로 변환하는지 확인한다.

### 10.4 UI tests

서버 mock보다 props 기반 render test를 우선한다. UI는 데이터를 어떻게 가져오는지 몰라야 한다.

### 10.5 E2E tests

기존 Playwright 흐름을 유지한다. 기준 feature 전환 후에는 current-session의 RSVP, 질문, 체크인 흐름을 smoke로 확인한다.

## 11. 품질 가드레일

- TypeScript `strict`는 유지한다.
- `feature/ui`에서 `readmatesFetch` import를 금지한다.
- `feature/model`에서 React와 React Router import를 금지한다.
- `shared`에서 `features`, `src/pages`, `src/app` import를 금지한다.
- feature 간 직접 import를 금지한다.
- 새 feature의 외부 소비는 기본적으로 `index.ts` 공개 API를 통해 한다.
- 리팩터링 commit은 phase별로 나눈다.
- API 분리, route 전환, UI redesign을 한 commit에서 섞지 않는다.
- 대형 화면 컴포넌트가 300~400줄 이상 커지면 model 또는 하위 UI 분리를 검토한다.

## 12. 성공 기준

이 리팩터링이 성공한 상태는 다음과 같다.

- 새 feature를 만들 때 파일 위치와 의존 방향이 명확하다.
- route, API, model, UI의 책임이 읽는 즉시 드러난다.
- 서버 response 변경의 영향 범위가 feature `api`와 `model` 주변에 머문다.
- feature UI는 props 기반으로 테스트할 수 있다.
- model은 React 없이 빠르게 테스트할 수 있다.
- import boundary가 자동 검증된다.
- `pnpm lint`, `pnpm test`, 주요 Playwright e2e가 통과한다.

## 13. 첫 실행 단위

첫 실행 단위는 `current-session` 기준 feature 전환이다.

권장 순서:

1. `shared/api`를 client/error/response helper로 분리한다.
2. `features/current-session/api`에 current-session endpoint를 옮긴다.
3. `features/current-session/model`에 view model과 form model을 만든다.
4. `features/current-session/route`에 route module을 만든다.
5. 기존 `components/current-session.tsx`를 route-aware container와 pure UI로 분해한다.
6. 기존 unit tests를 model, api, ui test로 재배치한다.
7. current-session e2e smoke를 실행한다.

이 첫 실행 단위가 끝나면 host feature 전환 전에 규칙의 불편함을 한 번 조정한다.
