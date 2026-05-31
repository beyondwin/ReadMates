# Server State Migration Status

본 문서는 TanStack Query 마이그레이션 진행 상황을 추적합니다.

## 이번 분기 진행 범위

Engineering proof portfolio 분기에서는 아래 순서로 server state migration을 진행했고, 현재 `public` read path와 platform admin operating console surface까지 완료했습니다.

1. `host/members` — 멤버 목록과 lifecycle/profile/viewer mutation을 Query invalidation 패턴으로 정리합니다.
2. `host/notifications` — 수동 알림 options/preview/confirm/dispatch ledger를 route-owned state와 Query cache로 분리합니다.
3. `host/sessions` — dashboard/session list, editor detail/manual dispatch read, session mutation을 Query cache로 옮깁니다.
4. `current-session` — 멤버 현재 세션 read/mutation path를 Query loader seeding과 invalidation으로 정리하고 custom route refresh event를 제거합니다.
5. `platform-admin` — summary, club directory/detail, support grants, onboarding/domain/club mutation cache ownership을 platform admin query module로 모읍니다.
6. `archive` / `feedback` / `public` — 공개/멤버 read path를 Query loader seeding으로 이전하고 AI commit 후 scoped invalidation으로 갱신합니다.
7. `platform-admin/ai-ops` — AI job 운영 요약과 ledger/action을 platform admin query module로 분리합니다.
8. `platform-admin/notifications` — 알림 운영 snapshot, event/delivery ledgers, replay preview/confirm mutation을 platform admin query module로 분리합니다.
9. `platform-admin/club-operations` — 클럽 상세 운영 snapshot을 loader-seeded Query read model로 분리합니다.
10. `platform-admin/support` — support search, grant ledger, grant create/revoke mutation cache ownership을 support route module로 분리합니다.
11. `platform-admin/audit` — 통합 감사 ledger를 loader-seeded Query read model로 분리합니다. Filter URL state는 S8 analytics가 재사용할 date range, club scope, source slice, action category, actor role, outcome vocabulary를 따릅니다.

각 migration은 UI 컴포넌트가 API를 직접 호출하지 않는다는 route-first 경계를 유지해야 합니다.

## 완료
- `host/invitations` — list query + create/revoke mutation + loader hand-off
- `host/members` — list query + lifecycle/profile/viewer mutation refresh + loader hand-off
- `host/notifications` — summary, event/delivery/audit ledgers, manual options, preview/confirm, and manual dispatch ledger query ownership + loader hand-off
- `host/sessions` — dashboard current/session list, editor detail/manual dispatch reads, session mutations, loader seeding, and notification session-selector sharing
- `current-session` — member current-session read path, RSVP/checkin/questions/review mutations, loader seeding, and query invalidation replacing the custom route refresh event
- `platform-admin` — summary, clubs, selected-club support grants, domain check, onboarding commit, club update, and support grant mutation cache ownership
- `archive` — list/detail reads, cursor pages, and session-record invalidation are Query-owned
- `feedback` — feedback document reads and AI commit invalidation are Query-owned
- `public` — club/session public reads use Query loader seeding with scoped invalidation
- `platform-admin/ai-ops` — AI Ops summary/job ledger reads and force-cancel invalidation are Query-owned
- `platform-admin/notifications` — admin notification snapshot, event/delivery cursor ledgers, replay preview, and replay confirm are Query-owned
- `platform-admin/club-operations` — selected club operations snapshot is loader-seeded and Query-owned
- `platform-admin/support` — support search, active grant ledger, grant create, and revoke invalidation are Query-owned
- `platform-admin/audit` — platform/club/notification replay/AI audit source를 Query-owned cursor ledger로 조회하고, route loader seeding과 safe metadata detail rendering을 적용합니다.

## 패턴
- query: `features/<feature>/queries/<area>-queries.ts` 에 `queryOptions` + `useXxxMutation` export
- query key: `[feature, area, op, params]` 형태 const tuple. Club-scoped host routes include `clubSlug` in the key scope.
- mutation: `onSuccess` 에서 affected list/detail/current/dashboard roots를 invalidate하고, 삭제처럼 canonical entity가 사라지는 경우 detail cache를 remove
- 컴포넌트는 actions props 인터페이스를 유지 — 테스트는 wrapper + mock actions 로 동일하게 작성
- cursor pagination helper: `front/shared/query/cursor-pagination.ts`의 `normalizePageRequest`, `pageFromNormalizedPageRequest`, `appendCursor`, `pageRequests`, `combineCursorPages`를 사용해 query key page normalization과 appended page 조립을 공유합니다. Feature-specific nested page shape는 feature-local wrapper에서 조립합니다.

## 후속 후보 (우선순위)
1. Design-system visual regression infrastructure
2. Further server read-model query budget work
