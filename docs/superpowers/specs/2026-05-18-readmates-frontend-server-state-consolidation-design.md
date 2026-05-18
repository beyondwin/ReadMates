# ReadMates Frontend Server-State Consolidation Design

작성일: 2026-05-18
최종 코드 레벨 리뷰: 2026-05-18
상태: APPROVED DESIGN SPEC (코드 레벨 리뷰 반영)

## Context

최근 브랜치는 `host/notifications`와 `host/sessions`를 TanStack Query 기반 server-state ownership으로 이전했다. 이 과정에서 loader seeding, query key scope, mutation invalidation, appended cursor pages, route-local UI state 분리 패턴이 정착했다.

남은 frontend server-state 표면에는 같은 문제가 아직 반복된다.

- `current-session`은 저장 성공 후 `READMATES_ROUTE_REFRESH_EVENT`를 발생시키고 route가 loader data를 직접 다시 읽는다.
- `host/notifications`, `host/sessions`, `archive`에는 page normalization, cursor append, page combining 로직이 feature-local로 반복된다.
- `platform-admin`은 summary, clubs, selected-club support grants, domain check, onboarding commit 결과를 route-local state로 직접 조정한다.

이번 작업은 제품 기능 추가가 아니라 frontend server-state 구조 고도화다. 목표는 최근 Query migration 패턴을 남은 고위험 route에 적용하고, 반복되는 cursor helper를 좁은 shared utility로 정리하는 것이다.

## Approved Direction

순차 migration을 사용한다.

1. `current-session` Query migration
2. cursor pagination helper 추출
3. `platform-admin` Query migration

이 순서는 가장 오래된 refresh-event 구조를 먼저 제거하고, host migration에서 검증된 pagination 반복을 공통화한 뒤, admin route-local server data를 Query cache로 옮기도록 한다.

## Goals

- `current-session`의 custom route refresh event와 직접 loader 재호출을 제거한다.
- current-session 저장 mutation 성공 후 Query invalidation으로 최신 server state를 반영한다.
- cursor pagination helper를 `shared/query` 아래의 작은 순수 함수로 추출한다.
- `platform-admin`의 서버 데이터 source of truth를 route-local state에서 Query cache로 이동한다.
- UI 컴포넌트는 계속 props/callback driven으로 유지한다.
- 기존 route-first dependency direction을 유지한다.

## Non-Goals

- 새 제품 기능을 추가하지 않는다.
- current-session, archive, platform-admin UI를 재디자인하지 않는다.
- public/member/host/admin 권한 정책이나 API contract를 변경하지 않는다.
- 모든 archive/public/feedback read path를 이번 spec에서 Query로 이전하지 않는다. Archive는 pagination helper 적용까지만 포함한다.
- TanStack Query helper를 범용 framework처럼 크게 만들지 않는다.
- server API, BFF proxy, database schema를 변경하지 않는다.

## Architecture

Frontend boundary는 기존 guide를 따른다.

```text
src/app -> src/pages -> features -> shared
```

Feature 내부는 다음 구조를 사용한다.

```text
features/<name>/api
features/<name>/queries
features/<name>/route
features/<name>/ui
shared/query
```

- `api`: BFF 호출과 request/response contract.
- `queries`: query key, `queryOptions`, mutation hooks, invalidation helper.
- `route`: loader seeding, route params/context, UI-only state, UI prop assembly.
- `ui`: props/callback 렌더링. `fetch`, feature API, route module, QueryClient를 직접 import하지 않는다.
- `shared/query`: side-effect 없는 cursor pagination helper.

`front/src/main.tsx`와 `front/src/app/router.tsx`의 기존 QueryClient wiring은 유지한다. 새 Query code는 같은 QueryClient를 사용해 loader와 component cache가 공유되게 한다.

### Router/QueryClient Identity (코드 레벨 결함 반영)

현재 `front/src/app/router.tsx`는 두 가지 노출을 한다.

```ts
export const routes: RouteObject[] = buildRoutes(createReadmatesQueryClient()); // module-load QC
export function createReadmatesRouter() { ... }                                 // runtime QC
```

`createReadmatesRouter()`는 `main.tsx`에서 RouterProvider와 같은 QueryClient를 공유하므로 production은 안전하다. 하지만 모듈 로드 시 만들어지는 `routes` export는 **다른 QueryClient를 캡처**한다. `front/tests/unit/spa-router.test.tsx`는 이 `routes`를 그대로 import해서 RouterProvider만 감싸기 때문에 다음 두 가지 위험이 새 Query 경로에서 동시에 발생한다.

1. Phase 1 적용 후 `CurrentSessionRoute`가 `useQuery`/mutation hook을 호출한다. `routes`는 자체 QueryClient에 seed하지만 spa-router 테스트의 RouterProvider는 `QueryClientProvider`로 감싸지 않으므로 hook이 throw한다. `spa-router.test.tsx`의 `/app/session/current`, `/clubs/:clubSlug/app/session/current` 케이스가 전부 깨진다.
2. Phase 3 적용 후 `/admin` 케이스에도 같은 문제가 일어난다.

해결 옵션:

- (선호) `front/src/app/router.tsx`에서 `routes`와 그 QueryClient를 함께 export한다. 예: `export const { routes, queryClient: routesQueryClient } = buildRoutesAndClient();`. spa-router test는 `<QueryClientProvider client={routesQueryClient}>`로 RouterProvider를 감싼다.
- 또는 `routes`를 lazy factory `buildDefaultRoutes()`로 바꿔 호출자가 자기 QueryClient를 가지고 정확히 한 번 만들도록 강제한다.

어느 방식이든, **loader가 `client.fetchQuery`로 seed하는 QueryClient와 `<QueryClientProvider>`에 주입되는 client는 반드시 같아야 한다**. 두 client가 다르면 component는 seed된 cache를 보지 못해 즉시 refetch가 일어나고, "loader seed → 같은 화면 유지"라는 spec 목표가 무너진다. 이 조건은 Phase 1/3 모두 적용된다.

## Phase 1: Current Session Query Migration

새 파일:

```text
front/features/current-session/queries/current-session-queries.ts
front/features/current-session/queries/current-session-queries.test.ts
```

Query key:

```text
currentSessionKeys.all
currentSessionKeys.scope(context)
currentSessionKeys.current(context)
```

`context`는 club-scoped route에서 `{ clubSlug }`를 포함하고, unscoped compatibility route에서는 `undefined`를 사용한다.

Query:

- `currentSessionQuery(context)` -> `getCurrentSession(context)`

Mutation hooks:

- `useUpdateCurrentSessionRsvpMutation(context)`
- `useSaveCurrentSessionCheckinMutation(context)`
- `useSaveCurrentSessionQuestionsMutation(context)`
- `useSaveCurrentSessionLongReviewMutation(context)`
- `useSaveCurrentSessionOneLineReviewMutation(context)`

각 mutation은 성공 시 `currentSessionKeys.scope(context)`를 invalidate한다. 실패 시 cache를 변경하지 않는다.

Loader는 auth와 current-session initial response를 계속 가져오되, route factory에서 Query cache를 seed하는 형태로 맞춘다. Component는 `useQuery(currentSessionQuery(context))`로 current data를 읽는다. `CurrentSessionPage`와 하위 UI는 지금처럼 `actions` props만 받는다.

`READMATES_ROUTE_REFRESH_EVENT`, `requestCurrentSessionRouteRefresh`, `useLayoutEffect` 기반 background loader reload는 제거한다. Query stale data가 마지막 성공 화면을 유지하므로 background refresh 실패가 화면을 비우지 않는다.

RSVP의 local optimistic UI와 rollback은 유지할 수 있다. Server state 정합성은 mutation success invalidation으로 맞춘다.

### Route action vs. Mutation Hook (코드 레벨 결함 반영)

`front/features/current-session/route/current-session-data.ts`의 `currentSessionAction`과 `front/src/app/routes/member.tsx`의 `action: currentSessionAction` 연결은 기존 `<Form>` post 호환을 위해 남아 있다. Migration 후 UI는 mutation hook을 사용하므로 action을 거치는 호출자는 없다.

결정:

- 이번 spec 범위에서 `currentSessionAction`과 `member.tsx`의 action wiring, 그리고 action 전용 helper들(`actionPayloadFromRequest`, intent parsing 등)을 함께 제거한다. 코드 표면을 줄이고, action 경로가 Query cache invalidation을 우회해 stale UI를 만드는 경로를 차단한다.
- `saveCurrentSessionQuestion` (단수형) API wrapper는 현재 사용처가 없으므로 (call site grep으로 확인) context 추가 대상에서 제외하거나 함께 삭제한다. 이번 PR이 정리하지 않으면 다음 정리 PR로 미룬다. 어느 쪽이든 spec에 명시한다.

### Non-factory `currentSessionLoader` Lifetime

`currentSessionLoaderFactory(client)`가 도입된 뒤에도 `currentSessionLoader`와 `loadCurrentSessionRouteData`는 호환용으로 남는다. 이중 경로는 임시적이다.

- 호환 path는 오직 QueryClient를 잡기 어려운 unit test에서 사용한다. spa-router 테스트가 routes export QueryClient를 공유하도록 정리되면 (위 *Router/QueryClient Identity* 참고), 호환 loader도 제거할 수 있다.
- Phase 1 종료 시점에 "호환 loader 제거"를 Phase 3 또는 Final Verification 단계의 명시적 follow-up으로 남긴다. Spec은 "non-factory loader는 Phase 3 종료까지 남기고, 그 후 별도 cleanup PR에서 제거한다"를 디폴트로 잡는다.

## Phase 2: Shared Cursor Pagination Helper

새 파일:

```text
front/shared/query/cursor-pagination.ts
front/shared/query/cursor-pagination.test.ts
```

Exports:

```text
normalizePageRequest(page)
pageFromNormalizedPageRequest(normalized)
appendCursor(cursors, cursor)
pageRequests(limit, cursors)
combineCursorPages(pages)
```

규칙:

- `undefined`와 omitted page field는 query key 안정성을 위해 `null`로 normalize한다.
- `pageFromNormalizedPageRequest`는 both-null이면 `undefined`를 반환한다.
- `appendCursor`는 null, undefined, empty string, duplicate cursor를 추가하지 않는다.
- `combineCursorPages`는 `{ items, nextCursor }` shape만 다룬다.
- `combineCursorPages`의 `nextCursor` 의미는 **"마지막으로 정의된(undefined 아님) 페이지의 `nextCursor`"** 이다. 객체는 항상 truthy이므로 `[...pages].reverse().find(Boolean)` 식이 곧 "마지막 페이지"가 아니라 "마지막 defined 페이지"로 동작한다. 기존 `host-notifications-route.tsx`의 `combinePages`도 동일 의미이며 이 의미를 그대로 옮긴다.
- 모든 입력 페이지가 `undefined`면 `{ items: [], nextCursor: null }`을 반환한다.
- `manualOptions`처럼 nested cursor가 있는 특수 shape는 feature-local wrapper가 helper 결과를 조립한다.
- Helper 출력 `{ limit, cursor }` shape는 feature-specific normalized request의 `page` field 값으로 그대로 저장된다. 이 invariant가 깨지면 query key가 흔들리므로 feature wrapper에서 property name이나 nesting을 임의로 바꾸지 않는다.

적용 대상:

- `front/features/host/queries/host-notification-queries.ts`
- `front/features/host/queries/host-session-queries.ts`
- `front/features/host/route/host-notifications-route.tsx`
- `front/features/archive/route/archive-list-route.tsx`의 cursor append/page combining 중 helper와 맞는 부분

`shared/query`는 `features`, `src/app`, `src/pages`를 import하지 않는다.

## Phase 3: Platform Admin Query Migration

새 파일:

```text
front/features/platform-admin/queries/platform-admin-queries.ts
front/features/platform-admin/queries/platform-admin-queries.test.ts
```

Query key:

```text
platformAdminKeys.all
platformAdminKeys.summary()
platformAdminKeys.clubs()
platformAdminKeys.supportGrantsRoot()
platformAdminKeys.supportGrants(clubId)
```

Queries:

- `platformAdminSummaryQuery()`
- `platformAdminClubsQuery()`
- `platformAdminSupportGrantsQuery(clubId)`

Mutation hooks:

- `useCheckPlatformAdminDomainProvisioningMutation()`
- `useCommitPlatformAdminOnboardingMutation()`
- `useUpdatePlatformAdminClubMutation()`
- `useCreateSupportAccessGrantMutation(clubId)`
- `useRevokeSupportAccessGrantMutation(clubId)`

Route ownership after migration:

- Query owns `summary`, `clubs`, and selected club support grants.
- Route keeps `selectedClubId`, `checkingDomainIds`, inline error maps, wizard state, and other UI-only state.
- `buildPlatformAdminWorkbench` continues to receive plain data from route props and remains pure.

Mutation cache behavior (코드 레벨 결함 반영 — invalidate vs targeted-update를 mutation별로 못 박는다):

- **Domain check** (`useCheckPlatformAdminDomainProvisioningMutation`): `setQueryData(summary, ...)`로 targeted update. 응답이 `PlatformAdminDomainResponse` 1건이라 server를 다시 부르지 않고 `domains` / `domainsRequiringAction` / `domainActionRequiredCount`를 client-side로 재계산한다. `recomputeActionRequiredCount`는 **기존 도메인이 summary에 없을 경우** 새 도메인이 `ACTION_REQUIRED`이면 `+1`을 반환해야 한다 — 이 함수가 onboarding commit 경로에도 재사용되기 때문이다. (현행 `platform-admin-route.tsx`의 동명 helper는 "기존 도메인이 없으면 count 그대로"였다. 동작 변경이므로 PR 리뷰에서 명시한다.) 서버 count 산식이 진화하면 client 추정이 drift할 수 있으므로, follow-up 옵션으로 background invalidate를 검토한다.
- **Onboarding commit** (`useCommitPlatformAdminOnboardingMutation`): `setQueryData(clubs, ...)` + `setQueryData(summary, ...)` (도메인이 응답에 포함된 경우) + **추가로** `invalidateQueries(summary)`와 `invalidateQueries(clubs)`를 트리거한다. Targeted update가 즉시 화면을 갱신하고, 뒤따르는 invalidation이 서버 진실값으로 정합성을 회복시킨다. 선택된 club id는 응답 `result.club.clubId`로 옮긴다.
- **Club update** (`useUpdatePlatformAdminClubMutation`): `setQueryData(clubs, ...)`로 targeted-update 전용. 응답이 단일 club 전체이므로 서버 round trip이 불필요하고 invalidate는 생략한다.
- **Support grant create** (`useCreateSupportAccessGrantMutation`): `setQueryData(supportGrants(clubId), ...)`로 prepend. 응답이 단일 grant이므로 invalidate 생략.
- **Support grant revoke** (`useRevokeSupportAccessGrantMutation`): `setQueryData(supportGrants(clubId), ...)`로 해당 grantId 제거. 응답 본문이 없어도 mutation variable에서 grantId를 회수해 안전하게 제거할 수 있다.
- **Mutation failure**: server cache를 변경하지 않고 panel-local 인라인 에러로만 표시한다.

Support grants remain selected-club scoped. The form still derives `clubId` from the selected club, not user input.

## Error Handling

`current-session`:

- Initial loader/auth failure uses the existing member route error boundary.
- Query refetch failure keeps stale data visible.
- Mutation failure maps to the existing save scope `error` state.
- No stack traces, API internals, or private data are shown.

`shared/query`:

- Helpers throw no expected runtime errors for normal empty inputs.
- Invalid feature-specific response shapes remain feature responsibility.

`platform-admin`:

- Initial summary/clubs loader failure stays route-level.
- Support grants query failure is panel-local and leaves selected club details visible.
- Domain check, club update, onboarding, support grant create/revoke failures are panel-local inline errors.
- Failed mutations do not write partial success into Query cache.

## Testing

Phase 1 targeted checks:

```bash
pnpm --dir front test -- current-session
```

Coverage expectations:

- loader seeds current-session query data.
- route reads current-session via Query.
- each save mutation invalidates the current-session scope on success.
- mutation failure leaves cache untouched and UI save scope enters error state.
- refresh event code is gone.

Phase 2 targeted checks:

```bash
pnpm --dir front test -- cursor-pagination host-notification host-session archive
```

Coverage expectations:

- page normalization is stable for `undefined`, empty page, limit-only, cursor-only, and limit+cursor.
- duplicate cursors are ignored.
- combined pages preserve item order and latest `nextCursor`.
- host notification/session query keys remain unchanged in semantic scope.

Phase 3 targeted checks:

```bash
pnpm --dir front test -- platform-admin
```

Coverage expectations:

- loader seeds summary and clubs.
- support grants query is scoped by selected club id.
- domain check/onboarding/club update/support grant mutations invalidate or update the intended keys.
- selected club id remains UI state and is not encoded as server cache identity.
- failed support grant load surfaces inline without clearing selected club details.

Full frontend checks after all phases:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

No E2E is required by default because this spec does not change auth, BFF, route paths, or API contracts. If implementation touches route guards, BFF paths, or user-flow wiring beyond the described migration, run:

```bash
pnpm --dir front test:e2e
```

## Documentation Updates

Update `docs/development/server-state-migration.md` when each phase lands:

- mark `current-session` complete after Phase 1.
- document `shared/query` cursor helper as the preferred pattern after Phase 2.
- mark `platform-admin` complete after Phase 3.
- leave `archive`, `feedback`, and `public` as future read-path candidates unless more scope is explicitly approved.

`CHANGELOG.md` should receive one concise Unreleased entry when implementation completes.

## Rollout And Residual Risk

Implement as three small commits or PR-sized changes. Do not combine all phases into one risky patch.

Primary residual risks:

- current-session local form state may conflict with refetched server data if a user edits while a background invalidation resolves.
- platform-admin targeted cache updates can drift from server-derived summary counts if they become too clever. 특히 domain check 경로는 `setQueryData`만 사용하므로 서버 count 산식 변경 시 추적 누락이 가능하다.
- a premature shared helper can hide feature-specific pagination behavior.
- `front/src/app/router.tsx`의 `routes` 모듈 export가 자체 QueryClient를 캡처하여 `spa-router.test.tsx`의 `<RouterProvider>` 단독 wrap을 깬다. Phase 1/3 진행 전 routes의 QueryClient 노출(또는 lazy factory 전환)이 선행되어야 한다.
- `currentSessionAction`을 살려두면 `<Form>` post가 mutation hook 경로를 우회해 Query cache를 stale 상태로 두는 hidden path가 된다. 이번 spec에서 함께 제거하여 차단한다.

Mitigations:

- Prefer invalidation over complex optimistic updates except for narrow existing RSVP rollback behavior.
- Keep shared helper limited to cursor mechanics only.
- Preserve UI-only state in routes and keep server data in Query cache.
- Run targeted tests after each phase and full frontend checks after the final phase.
