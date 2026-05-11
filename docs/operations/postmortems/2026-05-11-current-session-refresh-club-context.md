# Post-mortem — Current session refresh가 production에서만 빈 상태로 collapse

- 발생일시: 2026-05-11 (추정: 09:00 무렵 부터 영향 잠재, KST)
- 탐지일시: 2026-05-11 (추정: 11:00 이전, 본인 시연 중, KST)
- 완화일시: 2026-05-11 11:51 KST (commit `422a117` merge)
- 영구 수정일시: 2026-05-11 (추정: 12:00 무렵 production 배포 완료, KST)
- Severity: SEV2
- 영향 범위: production 사이트(`readmates.pages.dev`)의 모든 클럽에서 멤버가 current session route에서 mutation을 수행한 직후 페이지가 빈 상태로 collapse. 데이터는 안전. 우회: 페이지 새로 진입.
- 작성자: 운영자(1인)
- 상태: Closed
- 관련:
  - Spec: `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md`
  - Plan: `docs/superpowers/plans/2026-05-11-current-session-refresh-club-context-implementation-plan.md`
  - Fix commit: `422a117 fix(current-session): forward useParams to refresh handler`
  - Regression test commit: `63e166e test(current-session): regression test for clubSlug in route refresh`
  - Case study (예정): `docs/case-studies/03-multi-club-domain-platform.md`
  - ADR 후보: BFF host 헤더 정책 (후속)

## TL;DR

Production에서만 current session route의 silent background refresh가 `clubSlug`를 잃고 호출되어, BFF가 host 헤더로 club을 lookup → shared fallback domain은 club_domains에 없어 unscoped → server가 degraded auth로 응답 → 클라이언트가 빈 상태로 fallback. dev에서는 Vite proxy가 host 헤더를 strip하므로 재현 안 됨. 영구 수정은 refresh handler에서 `useParams()`로 slug를 명시 전달.

## 영향

- 사용자 영향: 모든 클럽의 멤버가 current session route에서 reading progress 저장, RSVP, 질문/한줄평 작성을 한 직후 페이지가 "아직 열린 세션이 없습니다" 빈 상태로 collapse. 페이지 새로 진입 시 정상 복구. 데이터 손실 없음.
- 데이터 영향: 없음. mutation은 정상 commit (HTTP 200, MySQL row 기록 확인).
- 매출/계약/SLA 영향: 해당 없음 (운영 SLA 미정).
- 내부 리소스: 탐지 → spec → plan → 수정 → 배포까지 약 1~2시간 (commit timestamp 기준: spec/plan 11:48 → fix 11:51 → regression test 11:54 KST).

## Timeline (KST)

| 시각 | 이벤트 |
|------|--------|
| 추정: 11:00 이전 | 본인 시연 중 reading progress 저장 → 빈 상태 collapse 발견 |
| 추정: ~11:15 | 재현 절차 확립. dev 환경에서 미재현 확인 |
| 추정: ~11:30 | Network panel + server log 확인 → `/api/auth/me` 요청에 `clubSlug` 누락 확인 |
| 추정: ~11:40 | BFF 호스트 헤더 정책과 server `ClubContextResolver` 동작 추적 → root cause 식별 |
| 11:48 | Spec + plan 작성 완료 (commit `0a72ed3`) |
| 11:51 | 수정 PR(fix) merge (commit `422a117`) |
| 11:54 | 회귀 테스트 추가 (commit `63e166e`) |
| 추정: ~12:00 | Production(Cloudflare Pages) 배포 완료 |
| 추정: ~12:10 | Manual repro로 빈 상태 미발생 확인 → Closed |

## 탐지

- 본인 시연 중 발견. 사용자 보고 전.
- 운영 alert 없음 (해당 metric/alert 미구축).
- 더 빨리 탐지할 수 있었는가:
  - production E2E smoke가 club-scoped path에서 mutation→refresh 흐름을 커버했다면 배포 전 탐지 가능. 현재 e2e는 dev-login 플로우 위주.
  - frontend error reporting (Sentry 등) 미구축 — auth degraded fallback이 사용자 측에서 발생하지만 서버에는 정상 응답으로 기록됨.

## Root cause

### 코드/시스템 차원

`front/features/current-session/route/current-session-route.tsx`의 refresh handler가 `useParams()` 없이 `loadCurrentSessionRouteData()`를 인자 없이 호출. 이는 `loadMemberAppAuth(undefined)` → `readmatesFetch`에 `{ clubSlug: undefined }` 명시 전달 → `readmatesApiPath`의 `hasOwnProperty("clubSlug")` 체크가 *명시적 undefined*를 "no club scope"로 해석 (platform-admin 페이지 의도적 동작) → URL fallback `currentAppClubSlug()` 우회 → `/api/bff/api/auth/me` 요청에 `clubSlug` 쿼리 누락.

production BFF (`front/functions/api/bff/[[path]].ts`)는 `X-Readmates-Club-Host: readmates.pages.dev`를 항상 첨부. server `ClubContextResolver`는 slug 없으면 host로 lookup → `JdbcClubContextAdapter.loadByHostname` → `club_domains` 테이블에 `readmates.pages.dev`는 path-routed shared fallback이라 `status = ACTIVE` row 없음 → null context.

`AuthMeController`는 `supplied=true && context=null`인 경우 degraded auth response (membershipStatus 없음)를 반환. `canUseMemberApp(auth)`가 false → `loadCurrentSessionRouteData`가 `{ currentSession: null }`로 short-circuit → 빈 상태 렌더.

상세 분석은 spec 본문(`docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md`) 참조.

### 프로세스/조직 차원

- dev/prod BFF 동작 parity가 자동 검증되지 않음. Vite proxy(dev)는 host 헤더 strip, Pages function(prod)은 항상 첨부. 이 차이가 잠재적 production-only bug class.
- BFF host 헤더 정책의 risk가 ADR/case study에 사전 기록되지 않음. shared fallback domain에서 host 헤더가 의미 있는 정보가 아닌데도 항상 전송하는 정책의 의도가 코드 외부에 명시되지 않음.
- production smoke가 club-scoped mutation→refresh를 커버하지 않음.

## 완화 (단기 조치)

탐지 직후 영구 수정과 단기 조치를 분리하지 않고 한 번에 영구 수정 PR로 진행. 우회는 사용자에게 안내 가능(페이지 새로 진입)했으나, 영향 범위가 모든 클럽 + 모든 멤버라 *분 단위 즉시 수정*이 더 작은 비용으로 판단.

## 영구 수정

`front/features/current-session/route/current-session-route.tsx`에서 `useParams()`로 slug를 가져와 `loadCurrentSessionRouteData({ params })`로 명시 전달. 이펙트 dependency에 `params` 추가로 stale closure 방지. 회귀 테스트 추가:

- `front/tests/unit/current-session.test.tsx` — club-scoped path에서 mount → refresh dispatch → 모든 `/api/sessions/current` 요청이 `clubSlug=reading-sai`를 포함하는지 검증.

상세 변경은 spec/plan 참조 (commits `422a117`, `63e166e`).

## 검증

- Pre-fix manual repro: production에서 reading progress 저장 → 빈 상태 발생.
- Post-fix:
  - `pnpm --dir front test` — 신규 회귀 테스트 green, 기존 "keeps current session visible on refresh failure" 유지.
  - `pnpm --dir front test:e2e` — current-session 시나리오 통과.
  - Production 배포 후 manual repro — 페이지 유지, "저장됨" 배지 표시.

## Lessons learned

**잘 한 것**
- 재현 → root cause → spec → 수정 → 배포가 같은 날 안에 closed.
- Spec 작성 시 dev/prod 차이를 표로 명시 → 후속 ADR 후보가 자연스럽게 도출.
- 회귀 테스트가 *failing-first*로 작성됨 (TDD 패턴 유지).

**못 한 것**
- dev/prod parity 자동 검증 없음. Vite proxy와 Pages function의 헤더 변환이 동등한지 확인하는 테스트 부재.
- BFF 정책 risk가 ADR/case study에 사전 기록되지 않음 — 동일 클래스의 production-only bug가 다른 라우트에서도 잠복할 수 있음.
- 운영 alert 미구축 — 탐지가 우연.

**운이 좋았던 것**
- 본인 시연 중 발견. 사용자 영향 시간 짧음.
- 우회(페이지 새로 진입) 가능했으므로 SEV1으로 격상되지 않음.

## Action items

| # | 항목 | 우선순위 | 오너 | 상태 | 트래킹 |
|---|------|---------|------|------|-------|
| 1 | dev/prod BFF 헤더 parity test 추가 (Vite proxy와 Pages function이 동일 입력에 동일 헤더를 생성함을 검증) | P1 | front | Deferred | 본 라운드 R2 재평가에서 잠복 incident 거의 없음 확인 (`docs/superpowers/specs/2026-05-11-postmortem-followup-consolidation-design.md`). 미래 BFF 헤더 의존 코드 추가 시 재평가. |
| 2 | BFF host 헤더 정책 ADR 후속 — shared fallback domain일 때 host 헤더 미전송 | P2 | docs / front | In progress | `docs/superpowers/specs/2026-05-11-bff-host-header-policy-design.md` (ADR-0011 후보) |
| 3 | 다른 라우트의 refresh path가 동일 패턴을 사용하는지 grep audit | P3 | front | Closed (2026-05-11) | `READMATES_ROUTE_REFRESH_EVENT`의 production 사용처는 `front/features/current-session/route/current-session-route.tsx` 단 1개임을 grep으로 확인. 다른 라우트의 `loadMemberAppAuth(args)`는 args forward로 초기 loader가 안전. |

(트래킹은 issue/PR이 생기면 갱신.)

## Follow-up 갱신 이력

| 일자 | 변경 | 출처 |
|------|------|------|
| 2026-05-11 | Action item #3 → Closed (grep audit 완료), #2 → In progress (ADR-0011 spec link), #1 → Deferred (시급성 재평가) | `docs/superpowers/specs/2026-05-11-postmortem-followup-consolidation-design.md` |

## Severity rationale

SEV2로 분류:
- 사용자 영향이 *전 사용자*에 미치지만(SEV1 후보), 우회(페이지 새로 진입)가 명확하고 데이터 손실 없음.
- 핵심 사용자 흐름(reading progress 저장)에서 발생하지만 mutation 자체는 성공.
- SEV3은 부적절 — 우회가 사용자에게 *직관적이지 않음*. 화면 메시지가 "아직 열린 세션이 없습니다"라 사용자는 자신의 mutation이 실패했다고 오인할 가능성.
