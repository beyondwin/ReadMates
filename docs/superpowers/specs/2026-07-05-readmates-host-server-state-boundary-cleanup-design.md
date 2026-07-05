# ReadMates Host Server-State Boundary Cleanup Design

작성일: 2026-07-05
상태: APPROVED DESIGN SPEC
대상 표면: frontend host members/invitations routes, host query ownership, frontend boundary tests, server-state migration docs

이 문서는 설계 승인 시점의 의사결정과 acceptance gate를 기록한다. 구현 이후 현재 동작은 실제 코드, tests, `docs/development/architecture.md`, `docs/development/server-state-migration.md`를 다시 확인한다.

## 1. 배경

ReadMates frontend는 route-first 경계를 따른다. Feature는 `api`, `queries`, `model`, `route`, `ui`로 나누고, `ui`는 presentation surface로서 props와 callback만 받아 렌더링하는 것이 목표다. Server state는 route/queries layer가 소유하고, UI가 TanStack Query client, query key, invalidation policy를 직접 알지 않게 한다.

설계 시점의 `docs/development/server-state-migration.md`는 `host/invitations`와 `host/members` migration을 완료 항목으로 기록했다. 하지만 당시 실제 boundary test에는 다음 legacy exception 3개가 남아 있었다.

- `features/host/ui/host-invitations.tsx` -> `features/host/queries/host-invitation-queries`
- `features/host/ui/host-members.tsx` -> `features/host/queries/host-members-queries`
- `features/host/queries/host-members-queries.ts` -> `features/host/route/host-members-actions`

설계 시점의 코드도 같은 상태를 보여줬다.

- `host-invitations.tsx`는 `useQuery`, `useMutation`, `useQueryClient`, `hostInvitationListQuery`, `invalidateHostInvitations`를 직접 import한다.
- `host-members.tsx`는 `useQuery`, `useQueryClient`, `hostMemberListQuery`, `hostMemberKeys`를 직접 import한다.
- `host-members-queries.ts`는 route-owned action type인 `HostMemberLifecyclePath`, `HostViewerAction`을 import한다.
- `host-members-data.ts`와 `host-invitations-data.ts`는 이미 loader seeding과 action object를 갖고 있으므로, ownership을 route/data layer로 완전히 옮길 자연스러운 자리도 존재한다.

이번 고도화는 새 사용자 기능이 아니라 문서상 완료된 server-state migration의 남은 boundary debt를 닫는 작업이다.

AI 에이전트 관점에서 이 debt는 작지 않다. 문서가 "완료"라고 말하는 표면에 test exception과 역방향 import가 남아 있으면, 다음 작업자는 `ui`, `route`, `queries`, `model` 중 어디가 server state를 소유하는지 추론하기 위해 여러 파일을 더 읽어야 한다. 이번 정리는 경계를 코드와 테스트에서 일치시켜, 새 작업자가 파일 위치만 보고도 책임을 예측할 수 있게 만드는 구조 개선이다.

## 2. 목표

성공 기준:

- `front/tests/unit/frontend-boundaries.test.ts`의 host members/invitations legacy boundary exception 3개를 제거한다.
- `front/features/host/ui/host-members.tsx`와 `front/features/host/ui/host-invitations.tsx`가 TanStack Query hook, QueryClient, query key, invalidation helper를 직접 import하지 않는다.
- `front/features/host/queries/host-members-queries.ts`가 `features/host/route/*`를 import하지 않는다.
- Loader seeding, mutation 후 invalidation, canonical query refresh는 route/data/queries layer가 소유한다.
- UI는 initial page, local appended page state, action callbacks, visible status/error state만 소유한다.
- AI나 새 개발자가 host members/invitations 작업을 시작할 때 `ui = presentation`, `route/data = loader/action/refresh`, `queries = query key/cache policy`, `model = neutral contract`라는 책임 구분을 예외 없이 적용할 수 있다.
- `docs/development/server-state-migration.md`는 host members/invitations migration 완료 상태와 이번 boundary cleanup 사실을 일관되게 설명한다.
- 서버 API, DB migration, BFF/auth, route URL 구조, product behavior는 변경하지 않는다.

## 3. Non-goals

- 새 host members/invitations 기능을 추가하지 않는다.
- Server API response contract, request contract, error code, auth/authorization behavior를 바꾸지 않는다.
- DB schema, Flyway migration, seed data를 바꾸지 않는다.
- BFF, OAuth, trusted header, session cookie, Cloudflare Pages Functions behavior를 바꾸지 않는다.
- Host members/invitations 화면의 visual redesign이나 copy rewrite를 하지 않는다.
- TanStack Query 자체를 제거하지 않는다. Query ownership 위치만 route-first 경계에 맞춘다.
- `host/notifications`, `host/sessions`, `current-session`, platform admin 등 다른 server-state surfaces를 이번 범위에 포함하지 않는다.

## 4. 검토한 접근

### 접근 A: Exceptions만 유지하고 문서 보강

Boundary exception 3개를 그대로 두고 `server-state-migration.md`에 "완료지만 legacy exceptions 존재"라고 적는다.

장점은 구현 리스크가 거의 없다는 점이다. 단점은 완료 문서와 boundary test의 예외가 계속 충돌하고, 다음 host UI 변경 때 같은 ownership 혼선이 반복된다는 점이다.

### 접근 B: Route/data layer ownership 완성 - 추천

`host-members-data.ts`, `host-invitations-data.ts`, 필요한 경우 작은 route-owned action contract를 조정해 loader seeding과 invalidation을 route/data layer로 올린다. UI는 query module을 직접 알지 않게 바꾸고 boundary exception을 제거한다.

장점은 기존 architecture direction과 일치하고, 서버/API 변경 없이 debt를 닫을 수 있다는 점이다. 단점은 host members/invitations UI의 refresh/pagination semantics를 보수적으로 보존해야 하므로 focused tests가 필요하다는 점이다.

### 접근 C: Host feature 전체 server-state 재작성

Host feature의 members, invitations, notifications, sessions를 한 번에 route-owned action/controller pattern으로 정리한다.

장점은 host feature 전체 경계가 더 균질해질 수 있다는 점이다. 단점은 이미 완료된 surfaces를 다시 흔들고, 검증 범위가 frontend 전체와 E2E로 넓어진다. 현재 남은 명확한 debt는 members/invitations 3개 exception이므로 과하다.

선택은 **접근 B**다.

## 5. 선택한 설계

선택한 설계는 **Host members/invitations route-owned server-state cleanup**이다.

원칙:

- Query key와 invalidation은 UI 밖에 둔다.
- Route/data layer는 loader seeding과 mutation success refresh를 소유한다.
- UI는 action callback을 호출하고, 화면 메시지와 in-flight row 상태를 표시한다.
- Pagination은 기존 user-visible behavior를 유지한다.
- Exception 제거가 acceptance gate다. Boundary test를 약화하거나 새 exception으로 대체하지 않는다.

## 6. Architecture

변경 전:

```text
host route loader
  -> seed host query
  -> HostMembers / HostInvitations
        -> useQuery
        -> useQueryClient
        -> query key / invalidation helper
        -> route actions callback

host queries
  -> route action types
```

변경 후:

```text
host route loader
  -> seed host query
  -> route/data-owned actions
        -> server call
        -> parse result
        -> invalidate canonical host query on success
  -> HostMembers / HostInvitations
        -> render initial/current page
        -> keep local appended rows and row pending state
        -> call props actions
        -> show status/error messages

host queries
  -> host api/model/shared paging types only
```

The browser-facing route structure, API paths, BFF trusted boundary, and server authorization model remain unchanged.

## 7. Component And Data Flow

### Host invitations

`host-invitations-data.ts` should own:

- first-page loader fetch and `hostInvitationListQuery({ limit: 50 })` seeding;
- create/revoke action wrappers;
- successful list invalidation through `invalidateHostInvitations`;
- response parsing helpers used by the UI action contract.

`host-invitations.tsx` should own:

- form field state;
- copied/created invitation message state;
- row pending state;
- appended page rows after "load more";
- visible error/status copy.

After create or revoke, UI should clear appended rows and reset cursor from the canonical first page when necessary, preserving the current stale-page avoidance behavior.

### Host members

`host-members-data.ts` should own:

- first-page loader fetch and `hostMemberListQuery({ limit: 50 })` seeding;
- lifecycle/profile/viewer action wrappers;
- successful invalidation through `invalidateHostMembers`;
- route-specific auth context handling.

`host-members.tsx` should own:

- active tab and dialog state;
- row pending state;
- local row projection after successful actions;
- appended page rows after "load more";
- visible error/status copy and focus return behavior.

The current local row update behavior remains valid. It gives immediate feedback after lifecycle/profile/viewer actions, while route/data invalidation refreshes canonical query state.

### Shared action contracts

`host-members-queries.ts` must not import from `features/host/route/*`. The action path/action type definitions used by both route data and queries should move to a neutral host model/action contract file, or query-local mutation types should be expressed without importing route modules.

The chosen implementation should keep type ownership simple:

- presentation-only action prop types may stay next to UI if they are UI-only;
- API/request/response types stay in `api` or `model`;
- types consumed by `queries` and `route` must not live in `route`.

## 8. Error Handling

User-facing copy stays stable unless a message is misleading after ownership moves.

Expected behavior:

- Create invitation 409 still shows the existing "already active member" message.
- Invitation create/revoke generic failures still show safe retry copy.
- Member lifecycle/profile/viewer failures still show the current safe retry copy.
- If a mutation succeeds but canonical refresh fails, UI can continue to show "처리는 완료됐지만 ... 최신 상태 확인" copy.
- Query invalidation failures should not be swallowed when the UI relies on them to choose a warning message.

No raw server error body, provider detail, private member data, token, local path, or deployment state should be introduced into UI copy, tests, or docs.

## 9. Pagination Consistency

Pagination remains conservative.

- The loader-seeded first page is canonical.
- "Load more" pages are appended in UI local state.
- Actions that can invalidate ordering or page content reset appended rows and cursor rather than merging stale cursor pages.
- Failed "load more" calls show the existing list-load failure copy and keep already rendered rows.

This design intentionally does not add infinite-query migration. The current cursor helper pattern can be revisited later if host members/invitations need multi-page caching beyond the first page.

## 10. File-Level Scope

Expected implementation files:

- `front/features/host/ui/host-invitations.tsx`
- `front/features/host/ui/host-members.tsx`
- `front/features/host/route/host-invitations-data.ts`
- `front/features/host/route/host-members-data.ts`
- `front/features/host/queries/host-invitation-queries.ts`
- `front/features/host/queries/host-members-queries.ts`
- a small neutral contract file under `front/features/host/model/` if needed
- `front/tests/unit/frontend-boundaries.test.ts`
- focused host members/invitations tests if existing coverage needs adjustment
- `docs/development/server-state-migration.md`
- `docs/development/release-readiness-review.md` only if implementation changes release-facing evidence or records closeout notes

Files not expected to change:

- `server/src/main/**`
- `server/src/main/resources/db/mysql/migration/**`
- `front/functions/**`
- route path definitions outside host members/invitations wiring
- Cloudflare/deploy workflows

## 11. Testing And Verification

Design/spec verification:

```bash
git diff --check -- docs/superpowers/specs/2026-07-05-readmates-host-server-state-boundary-cleanup-design.md
```

Implementation verification should include:

```bash
pnpm --dir front test -- frontend-boundaries host-members host-invitations
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

If implementation changes route loader behavior or user-visible host workflows beyond ownership cleanup, add targeted E2E:

```bash
pnpm --dir front test:e2e -- tests/e2e/member-lifecycle.spec.ts tests/e2e/host-club-operations.spec.ts
```

Docs-only closeout checks:

```bash
git diff --check -- docs/development/server-state-migration.md docs/development/release-readiness-review.md
```

## 12. Acceptance Criteria

- Host members/invitations boundary exceptions are removed rather than replaced.
- `pnpm --dir front test -- frontend-boundaries` passes.
- Host UI files do not directly import `@tanstack/react-query`, host query keys, or invalidation helpers.
- Host query modules do not import from `features/host/route/*`.
- Host members/invitations still support first-page render, load more, create/revoke, lifecycle/profile/viewer actions, success messages, and safe failure messages.
- `docs/development/server-state-migration.md` reflects the actual boundary state after cleanup.
- No server API, DB migration, BFF/auth, OAuth, deploy, release image, or product route URL change is introduced.

## 13. Remaining Risks

- The ownership move can accidentally change subtle refresh behavior after a mutation. Focused host members/invitations tests should cover mutation success, refresh failure, and pagination reset paths that already exist.
- Query invalidation moved into route/data actions can make isolated UI tests simpler but route/data tests more important. If existing tests only cover UI rendering, add focused tests around action wrappers or route data helpers.
- `load more` remains UI-local appended state. This is acceptable for this cleanup, but it is not a full infinite-query migration.
- The cleanup closes known host members/invitations boundary debt only. Other frontend architecture exceptions should stay out of scope unless they are direct fallout from this work.

## 14. Spec Self-review

- Placeholder scan: no placeholder markers, incomplete paths, or unspecified acceptance gates remain.
- Internal consistency: the design keeps Query ownership in route/data/queries layer and UI presentation state in UI components.
- Scope check: the work is small enough for one implementation plan and does not mix in server, DB, BFF, deploy, or visual redesign changes.
- Ambiguity check: exception removal, import boundaries, unchanged product behavior, and verification commands are explicit.
