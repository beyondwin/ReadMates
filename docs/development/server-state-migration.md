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
