# Server State Migration Status

TanStack Query 이관 현황과 따라야 할 패턴입니다.

## 현재 상태

주요 화면의 이관은 끝났습니다. 새 server state도 같은 패턴을 따릅니다. 어떤 경우에도 UI 컴포넌트는 API를 직접 부르지 않는다는 route-first 경계를 지킵니다.

## 완료

| 영역 | Query 모듈 | Query가 소유하는 것 |
| --- | --- | --- |
| host invitations | `host/queries/host-invitation-queries.ts` | 목록, 생성/회수 mutation, loader hand-off |
| host members | `host/queries/host-members-queries.ts` | 목록, lifecycle/profile/viewer mutation. action contract는 `route` 밖에 둡니다. |
| host notifications | `host/queries/host-notification-queries.ts` | 요약, event/delivery/audit ledger, 수동 발송 options/preview/confirm, dispatch ledger |
| host sessions | `host/queries/host-session-queries.ts` | dashboard, 세션 목록, editor detail, 세션 mutation, 알림 세션 선택 공유 |
| host session records | `host/queries/host-session-record-queries.ts` | 회차 장부, editor live/draft projection, cursor history, draft save/apply/restore, 호스트 작업 알림 preview/confirm. JSON/AI commit receipt의 draft revision도 editor cache와 맞춥니다. |
| host club operations | `host/queries/host-club-operations-queries.ts` | 클럽 운영 read model |
| current session | `current-session/queries/current-session-queries.ts` | 현재 세션 read, RSVP/체크인/질문/서평 mutation. 예전 custom refresh event를 대체합니다. |
| archive | `archive/queries/archive-queries.ts`, `profile-queries.ts` | 목록/상세, cursor page, 세션 기록 invalidation |
| feedback | `feedback/queries/feedback-queries.ts` | 피드백 문서 read, AI commit 뒤 invalidation |
| public | `public/queries/public-queries.ts` | 클럽/세션 공개 read, loader seeding, scoped invalidation |
| guest browse | `guest-browse/queries/guest-browse-queries.ts` | 익명 게스트 앱 read |
| platform admin | `platform-admin/queries/platform-admin-queries.ts` | 요약, 클럽 목록/상세, support grant, domain check, onboarding commit, 클럽 수정 |
| admin AI Ops | `platform-admin-ai-ops-queries.ts` | AI Ops 요약, job ledger, force-cancel invalidation |
| admin notifications | `platform-admin-notifications-queries.ts` | 알림 snapshot, event/delivery cursor ledger, replay preview/confirm |
| admin club operations | `platform-admin-club-operations-queries.ts` | 선택한 클럽의 운영 snapshot(loader seeding) |
| admin support | `platform-admin-support-queries.ts` | support 검색, grant ledger, grant 생성/회수 |
| admin audit | `platform-admin-audit-queries.ts` | platform/club/알림 replay/AI 감사 cursor ledger, safe metadata detail |
| admin health, analytics, operations | `platform-admin-health-queries.ts`, `platform-admin-analytics-queries.ts`, `platform-admin-operations-queries.ts` | 운영 헬스, 분석, `/admin/today` 운영 case queue와 acknowledge/snooze/resolve mutation |

경로는 `front/features/` 기준입니다.

## 패턴

- **query**: `features/<feature>/queries/<area>-queries.ts`에서 `queryOptions`와 `useXxxMutation`을 export합니다.
- **query key**: `[feature, area, op, params]` 형태의 const tuple입니다. club-scoped host route는 key에 `clubSlug`를 넣습니다.
- **mutation**: `onSuccess`에서 영향받는 list/detail/current/dashboard root를 invalidate합니다. 삭제처럼 entity가 사라지면 detail cache를 remove합니다.
- **컴포넌트**: actions props 인터페이스를 유지합니다. 테스트는 wrapper와 mock actions로 씁니다.
- **cursor pagination**: `front/shared/query/cursor-pagination.ts`의 `normalizePageRequest`, `pageFromNormalizedPageRequest`, `appendCursor`, `pageRequests`, `combineCursorPages`로 page 정규화와 이어 붙이기를 공유합니다. feature별 nested page 모양은 feature 안의 wrapper에서 조립합니다.

## 후속 후보 (우선순위)

현재 진행 중인 이관 작업은 없습니다. 이전 후보였던 route-critical 시각 회귀(`pnpm --dir front test:ct:docker`)와 서버 read model query budget/EXPLAIN 검사(`ServerQueryBudgetTest`, `MySqlQueryPlanTest`)는 이미 들어가 있습니다.
