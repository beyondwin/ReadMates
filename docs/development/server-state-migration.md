# Server State Migration Status

본 문서는 TanStack Query 마이그레이션 진행 상황을 추적합니다.

## 이번 분기 계획

Engineering proof portfolio 분기에서는 다음 순서로 server state migration을 진행합니다.

1. `host/members` — 멤버 목록과 lifecycle/profile/viewer mutation을 Query invalidation 패턴으로 정리합니다.
2. `host/notifications` — 수동 알림 options/preview/confirm/dispatch ledger를 route-owned state와 Query cache로 분리합니다.
3. `host/sessions` — 세션 목록/read path부터 좁게 시작하고 editor mutation은 별도 pass로 나눕니다.

각 migration은 UI 컴포넌트가 API를 직접 호출하지 않는다는 route-first 경계를 유지해야 합니다.

## 완료
- `host/invitations` — list query + create/revoke mutation + loader hand-off
- `host/members` — list query + lifecycle/profile/viewer mutation refresh + loader hand-off
- `host/notifications` — summary, event/delivery/audit ledgers, manual options, preview/confirm, and manual dispatch ledger query ownership + loader hand-off
- `host/sessions` — dashboard current/session list, editor detail/manual dispatch reads, session mutations, loader seeding, and notification session-selector sharing

## 패턴
- query: `features/<feature>/queries/<area>-queries.ts` 에 `queryOptions` + `useXxxMutation` export
- query key: `[feature, area, op, params]` 형태 const tuple. Club-scoped host routes include `clubSlug` in the key scope.
- mutation: `onSuccess` 에서 affected list/detail/current/dashboard roots를 invalidate하고, 삭제처럼 canonical entity가 사라지는 경우 detail cache를 remove
- 컴포넌트는 actions props 인터페이스를 유지 — 테스트는 wrapper + mock actions 로 동일하게 작성

## 후속 후보 (우선순위)
1. `current-session` (member current session actions and route refresh event)
2. `platform-admin` (summary/clubs/support grants/domain checks/onboarding)
3. `archive`, `feedback`, `public` — 읽기 중심, loader 와 결합도 높음
