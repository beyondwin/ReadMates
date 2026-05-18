# ReadMates vNext AI Ops + Query Foundation Design

작성일: 2026-05-18
상태: APPROVED DESIGN SPEC

## 배경

v1.11.0은 ReadMates의 운영 신뢰도를 크게 올렸다. 프런트엔드에서는 `host/members`, `host/notifications`, `host/sessions`, `current-session`, `platform-admin`의 server state를 TanStack Query 중심으로 이전했고, 서버에서는 AI generation job에 `COMMITTING`/`COMMITTED` 상태와 CAS 전이 정책을 추가했다. 그 결과 route-local refresh event와 비동기 AI job 경합은 상당 부분 줄었다.

하지만 두 고도화 흐름이 아직 완전히 만난 상태는 아니다.

- `archive`, `feedback`, `public` read path는 아직 Query migration 후속 후보로 남아 있다 (`docs/development/server-state-migration.md` "후속 후보" 섹션).
- 호스트 세션 편집기(`front/features/host/ui/host-session-editor.tsx`)는 `handleAigenCommitted` 콜백 안에서 `window.location.reload()`를 호출해 server state를 회복한다. `AiGenerateTab`이 직접 reload하지 않고 parent editor가 reload하는 구조다.
- AI generation의 durable audit row(`ai_generation_audit_log`, V30 migration)와 Redis live job state(`RedisAiGenerationJobStore`)는 존재하지만, 운영자가 전체 job 상태, 실패 코드, 비용, stale 후보를 보는 `/admin` 표면은 없다.
- 호스트는 새로고침하거나 화면을 떠났다가 돌아온 뒤 자기 세션의 in-flight/recoverable job을 다시 찾는 전용 read path가 없다. 현재 `JobRecord`는 `expiresAt`만 있고 `createdAt`/`lastUpdatedAt` metadata가 없어서 recency 정렬도 직접 불가능하다.

이번 vNext 범위는 **Query foundation을 먼저 완성하고, 그 위에 역할별 AI 운영 표면을 얹는 것**이다. 하나의 제품/기술 스펙으로 묶되 구현 순서는 foundation → host recovery → platform admin AI Ops를 따른다.

## Source Audit Findings (2026-05-18 deep review)

Source 코드 검증 후 다음 사항이 보강되었다. 본문에 각각 반영되어 있으니 구현 시 참고한다.

- `JobRecord`는 현재 `expiresAt`만 가지고 있고 `createdAt`/`lastUpdatedAt`은 추가 작업이다. Redis hash 직렬화/역직렬화 양쪽 모두를 갱신해야 한다.
- AI commit reload는 `host-session-editor.tsx` 안의 `handleAigenCommitted`에서 일어난다. `AiGenerateTab.tsx`에는 reload 호출이 없으므로 prop signature 변경은 editor 레벨에서 한다.
- `front/src/app/routes/public.tsx`는 현재 `QueryClient`를 인자로 받지 않는다. Public Query 이전은 `router.tsx`의 `buildRoutes`/`publicRoutes` 시그니처 통일을 동반한다.
- Admin force-cancel은 `JOB_NOT_LIVE`(audit terminal) vs `JOB_EXPIRED`(audit active인데 Redis 사라짐)를 구분해야 하고, 새 `AiGenerationException.SafeOpsError` (또는 동등 `Coded` subtype)로 wire에 전달한다.
- Admin job detail은 cursor 기반 list 재사용이 아니라 `AiGenerationAuditQueryPort.findJobById` 단일 row lookup으로 구현한다.
- `month-to-date` summary는 "지난 31일" 슬라이딩 윈도우가 아니라 현재 캘린더 월의 1일 00:00 UTC 누계로 산출한다.
- Host recovery는 `FAILED` 상태 중 retry-safe error code 화이트리스트만 노출한다 (`AI_DISABLED`, `INVALID_REQUEST` 등 user/config error 제외).
- Recovery strip의 recent-job query는 non-terminal 동안 짧은 interval(예: 4초)로 polling을 재개하고 terminal에서 멈춘다.
- `DefaultAiGenerationAuthorizationPolicy`(host JDBC dependency 남아 있음)에는 새 admin ops path가 의존하지 않는다. 별도 `AiGenerationOpsAuthorizationPolicy`를 둔다.

## Source Documents

- `docs/development/architecture.md`
- `docs/development/server-state-migration.md`
- `docs/superpowers/specs/2026-05-18-readmates-frontend-server-state-consolidation-design.md`
- `docs/superpowers/specs/2026-05-18-readmates-aigen-job-commit-state-machine-design.md`
- `docs/superpowers/specs/2026-05-18-readmates-v1-11-0-post-release-followups-design.md`
- `docs/agents/front.md`
- `docs/agents/server.md`
- `docs/agents/design.md`
- `docs/agents/docs.md`

## 승인된 방향

승인된 접근은 **Query foundation first**이다.

1. `archive`, `feedback`, `public` read paths를 TanStack Query 패턴으로 이전한다.
2. 호스트 AI commit 후 full reload를 제거하고 Query invalidation/targeted update로 화면을 갱신한다.
3. 호스트 세션 편집기에는 세션 단위 AI recovery strip을 추가한다.
4. `/admin`에는 전체 클럽을 보는 AI Ops 콘솔을 추가한다.

역할별 표면은 다음처럼 나눈다.

- 호스트: 자기 세션의 현재/최근 AI job을 이해하고 안전하게 복구한다.
- 플랫폼 관리자: 전체 AI 운영 상태를 감사하고 비정상 job을 진단/정리한다.

## 목표

- `archive`, `feedback`, `public` read path를 Query-owned server state로 이전한다.
- AI commit 성공 후 `window.location.reload()`를 제거한다.
- AI commit, JSON import commit, publication/feedback 변경 뒤 관련 Query cache가 일관되게 갱신되도록 한다.
- 호스트 세션 편집기에서 최근 recoverable AI job을 다시 찾아 polling/취소/commit 재시도를 할 수 있게 한다.
- `/admin`에서 AI job ledger, 상태 분포, 실패 코드, provider/model 비용, stale 후보를 볼 수 있게 한다.
- 플랫폼 관리자에게 제한된 운영 액션(`force-cancel`)을 제공한다.
- transcript, result JSON, provider raw error, secret, token, private deployment state를 어떤 새 화면/API/로그에도 노출하지 않는다.

## 비목표

- Prompt 품질 개선, LLM 출력 문체 개선, LLM-as-judge 평가는 하지 않는다.
- provider 모델 자동 교체나 모델 카탈로그 관리 UI를 만들지 않는다.
- secret/provider key 관리, 비용 한도 설정 변경 UI, provider credential rotation은 포함하지 않는다.
- Redis raw payload explorer, transcript viewer, generated result JSON 원문 viewer는 만들지 않는다.
- 호스트에게 cross-club job 조회, 강제 Redis cleanup, 다른 세션/job 운영 액션을 제공하지 않는다.
- 플랫폼 admin의 모든 운영 액션을 1차 범위에 넣지 않는다. `force-cancel`만 포함하고 raw delete는 제외한다.

## Architecture

### Frontend

Frontend boundary는 기존 route-first 방향을 유지한다.

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

추가/변경될 주요 모듈은 다음과 같다.

```text
front/features/archive/queries/archive-queries.ts
front/features/feedback/queries/feedback-queries.ts
front/features/public/queries/public-queries.ts
front/features/host/aigen/queries/aigen-job-queries.ts
front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts
```

`ui` 컴포넌트는 계속 props/callback driven으로 유지한다. Query hook은 route/container 또는 feature-owned query boundary에서 호출하고, presentation component가 API client나 QueryClient를 직접 import하지 않는다.

### Server

AI Ops server slice는 `aigen` feature 안에 둔다.

```text
aigen.adapter.in.web
  -> aigen.application.port.in
  -> aigen.application.service
  -> aigen.application.port.out
  -> aigen.adapter.out.persistence / aigen.adapter.out.redis
```

새 controller는 HTTP parsing과 `CurrentMember`/`CurrentPlatformAdmin` intake만 담당한다. 조회/권한/상태 전이 판단은 application service로 내리고, MySQL/Redis 접근은 outbound port와 adapter 뒤에 둔다.

가능하면 `ServerArchitectureBoundaryTest`의 migrated package 목록에 `com.readmates.aigen.adapter.in.web..`와 `com.readmates.aigen.application..`을 추가해 새 slice가 같은 경계를 따르도록 한다. 기존 `DefaultAiGenerationAuthorizationPolicy`처럼 controller-adjacent JDBC 의존이 남아 있는 부분은 이번 작업 범위에서 새 ops path가 의존하지 않게 하고, 별도 정리 후보로 남긴다.

## Query Foundation

### Archive

`archive`는 목록과 세션 상세 read path를 Query로 이전한다. 기존 cursor pagination helper(`front/shared/query/cursor-pagination.ts`)를 사용해 query key page normalization과 appended page 조립을 맞춘다.

AI commit 또는 JSON import commit 이후에는 새 publication/feedback state가 archive detail/list에 반영되어야 하므로, host session mutation success에서 archive root를 invalidate할 수 있어야 한다.

### Feedback

`feedback`은 피드백 문서 조회/print read path를 Query로 이전한다. AI commit이 feedback document를 새로 저장하거나 교체하면 해당 `sessionId`의 feedback document query를 invalidate한다.

권한 없는 피드백 문서, 문서 없음, 출석자 전용 경계 같은 feature-specific unavailable state는 기존 feature UI가 계속 소유한다. Query error를 generic route error로 넓게 밀어내지 않는다.

### Public

`public`은 클럽 소개, 공개 기록, 공개 세션 상세 read path를 Query로 이전한다. CDN/BFF cache가 있는 public API의 성격상 client-side Query cache는 짧은 stale time 또는 route loader seeding을 사용한다. Public visibility가 바뀌거나 기록이 발행되면 관련 public query root를 invalidate할 수 있게 한다.

현재 `front/src/app/routes/public.tsx`는 `member.tsx`/`router.tsx`와 달리 `queryClient`를 인자로 받지 않는다. Public 이전 작업의 부수적 변경으로 `router.tsx`의 `buildRoutes(queryClient)`가 public 분기에도 `queryClient`를 전달하도록 시그니처를 통일한다.

### Full Reload 제거

현재 `host-session-editor.tsx`의 `handleAigenCommitted` callback은 `window.location.reload()`로 server state를 회복한다. `AiGenerateTab`은 reload를 부르지 않고 parent editor에 `onCommitted` 콜백만 던지므로, reload 제거 작업은 editor에서 prop signature를 `onAigenCommitted(sessionId)`로 바꾸고 route layer가 Query invalidation을 주입하는 방향으로 진행한다. vNext에서는 다음으로 바꾼다.

1. `commitGeneration` mutation이 성공한다.
2. `hostSession` detail, host dashboard/session list, current-session, archive, feedback, public query roots 중 영향을 받는 key를 invalidate한다.
3. editor detail query가 refetch되면 publication/feedback document state가 갱신된다.
4. UI는 `COMMITTED` 상태를 표시하고 reload 없이 편집기 안에 머문다.

Targeted update는 응답이 완전한 canonical entity를 담을 때만 사용한다. AI commit 응답이 여러 feature read model에 영향을 주는 동안은 broad-but-scoped invalidation을 기본값으로 둔다.

## Host AI Recovery

호스트 화면은 세션 단위 recovery만 제공한다.

새 endpoint:

```text
GET /api/host/sessions/{sessionId}/ai-generate/jobs/recent
```

응답은 현재 세션에서 가장 최근 recoverable job을 반환한다. Recoverable의 기본 정의는 다음 상태다.

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `COMMITTING`
- `FAILED` 중 retry 안내가 필요한 safe error (구체적으로 `QUEUE_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`, `ILLEGAL_GENERATION_STATE`처럼 재시도가 의미 있는 error code 화이트리스트만 포함한다. `AI_DISABLED`, `INVALID_REQUEST`, transcript validation 실패 같은 user/config error는 recovery 대상이 아니다.)

`COMMITTED`, `CANCELLED`, TTL 만료 job은 기본적으로 recovery strip에 표시하지 않는다. 다만 직전 terminal 상태 안내가 UX상 필요하면 1회성 success/cancelled status만 보여주고 액션은 제공하지 않는다.

Recovery strip은 non-terminal 상태인 동안 짧은 interval로 자동 polling을 재개해 호스트가 별도 액션 없이도 진행도를 본다. terminal로 전이되면 polling을 멈춘다.

호스트 허용 액션:

- polling 재개: 기존 `GET /jobs/{jobId}` polling을 다시 시작한다.
- cancel: 기존 `DELETE /jobs/{jobId}`를 사용한다.
- commit retry: `SUCCEEDED` 또는 commit validation 실패 후 `SUCCEEDED`로 복구된 job에 한해 기존 commit endpoint를 다시 호출한다.
- 새 job 시작: 기존 start flow로 돌아간다.

호스트 금지 액션:

- 다른 클럽/job 조회
- 다른 세션 job 조회
- raw Redis cleanup
- provider/cost 전역 조정
- transcript/result payload 열람

프런트는 `front/features/host/aigen/queries/aigen-job-queries.ts`에 query key와 mutation hook을 둔다. 기존 `useAiGenerationJob` polling hook은 query module로 이동하거나 그 위에 thin wrapper로 남긴다.

## Platform Admin AI Ops

`/admin`에는 AI Ops 탭 또는 섹션을 추가한다. 기존 `PlatformAdminDashboard`의 work queue/club brief 구조를 유지하면서, admin route가 Query cache에서 AI Ops data를 가져와 presentation component에 props로 전달한다.

새 endpoint:

```text
GET  /api/admin/ai-generation/summary
GET  /api/admin/ai-generation/jobs?status=&clubId=&errorCode=&cursor=
GET  /api/admin/ai-generation/jobs/{jobId}
POST /api/admin/ai-generation/jobs/{jobId}/force-cancel
```

### Summary

Summary는 다음 정보를 제공한다.

- active job count (Redis live index 기준)
- failed jobs in last 24h
- month-to-date cost estimate (현재 캘린더 월의 1일 00:00 UTC 이후 누계. "지난 31일" 슬라이딩 윈도우가 아니다.)
- provider/model별 token/cost aggregate (현재 월)
- failure-code 분포 (현재 월)
- stale candidate count (`PENDING`/`RUNNING`/`COMMITTING` 상태이면서 `lastUpdatedAt`이 15분 이상 갱신되지 않은 job)
- AI kill switch/provider availability summary

### Job Ledger

Job ledger는 운영자가 스캔할 수 있는 safe metadata만 노출한다.

- job id
- club id/name/slug
- session id/number/book title
- host user id 또는 masked host email/name
- status/stage/progress
- provider/model
- created age, updated age, expiresAt
- token/cost aggregate
- errorCode, safe errorMessage
- stale/retryable/actionable flags

Transcript 본문, generated result JSON, provider raw response/error, instructions, private feedback body는 노출하지 않는다.

### Admin Action

1차 admin action은 `force-cancel`만 제공한다.

- `OWNER`, `OPERATOR`만 실행 가능하다.
- `SUPPORT`는 read-only다.
- 대상은 non-terminal Redis live job이어야 한다.
- 동작은 `CANCELLED` 상태 전이와 transient payload 삭제다.
- action 결과는 별도 `ai_generation_admin_action_audit` table에 남긴다.
- Redis live job이 없는 경우, MySQL audit row가 terminal(`COMMITTED`/`CANCELLED`/`FAILED`)이면 `JOB_NOT_LIVE`를 반환하고, audit row의 last status가 active였는데 Redis에서 사라졌다면 (TTL/expiry) `JOB_EXPIRED`를 반환한다. 두 경우 모두 generic `JOB_NOT_FOUND`로 합치지 않는다.
- 이 endpoint는 기존 host-facing `DefaultAiGenerationAuthorizationPolicy`(controller-adjacent JDBC dependency가 남아 있는 host 권한 정책)에 의존하지 않는다. Admin role gating은 `CurrentPlatformAdmin` argument resolver와 service-level role check에만 의존하고, 별도의 `AiGenerationOpsAuthorizationPolicy`로 분리한다.

Raw Redis `DEL` action은 만들지 않는다. Redis key 직접 정리는 운영 runbook/SSH last resort로 남긴다.

## Data Sources

### MySQL Audit

`ai_generation_audit_log`는 durable evidence source다.

사용 범위:

- historical job ledger
- cost/token aggregate
- failure-code aggregate
- provider/model usage distribution
- commit/regenerate/cancel history

필요한 경우 migration으로 조회 index를 보강한다.

후보 index:

```sql
INDEX idx_aigen_audit_job_created (job_id, created_at)
INDEX idx_aigen_audit_status_created (status, created_at)
INDEX idx_aigen_audit_error_created (error_code, created_at)
INDEX idx_aigen_audit_model_created (provider, model, created_at)
```

기존 audit table에 raw transcript는 없고 `transcript_sha256`만 있다. 새 admin API도 같은 원칙을 유지한다.

Admin action은 기존 `ai_generation_audit_log`에 억지로 끼우지 않는다. 기존 table은 host job lifecycle과 LLM 비용 증거를 담고, admin action actor를 표현할 column이 없다. vNext에서 admin action을 shipping한다면 아래 성격의 table을 추가한다.

```text
ai_generation_admin_action_audit
  id
  job_id
  club_id
  session_id
  admin_user_id
  admin_role
  action
  previous_status
  next_status
  result
  safe_error_code
  created_at
```

이 table도 transcript, result JSON, provider raw error, instructions를 저장하지 않는다.

### Redis Live State

Redis는 TTL-bound live workflow source다. Admin listing이 Redis `SCAN`에 의존하지 않도록 metadata index를 명시적으로 둔다.

후보 key:

```text
aigen:session:{sessionId}:jobs
aigen:jobs:active
aigen:club:{clubId}:jobs:active
```

Index value는 job id와 timestamp 중심의 최소 metadata다. Transcript/result/instructions/provider raw error는 index에 넣지 않는다.

현재 `JobRecord`(`server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`)는 `expiresAt`만 있고 `createdAt`/`lastUpdatedAt` metadata가 없다. 이번 작업에서 `JobRecord`와 Redis hash에 safe `createdAt`/`lastUpdatedAt`을 추가한다. `AiGenerationJobStore.save`, `transitionStatus`, `deleteTransientPayload`, `delete`는 index와 `lastUpdatedAt`을 함께 갱신해야 한다. 상태가 terminal로 바뀌면 active index에서 제거하고, session recent index는 TTL 동안 최근 job lookup이 가능하도록 유지한다.

`AiGenerationJobStore`에는 `loadRecentForSession(sessionId)`, `loadActiveJobs()`, `findJobById(jobId)` read port를 추가한다. Admin job detail은 cursor 기반 list를 우회해 단일 row를 직접 조회해야 하므로 dedicated query를 둔다.

## API DTO Rules

Wire DTO는 public-safe field만 가진다.

Host recent job response:

```text
jobId
status
stage
progressPct
model
error { code, message }
costEstimateUsd
expiresAt
createdAt
lastUpdatedAt
availableActions[]
```

Admin job list item:

```text
jobId
club { clubId, slug, name }
session { sessionId, number, bookTitle }
status
stage
provider
model
errorCode
safeErrorMessage
costEstimateUsd
tokenUsage
createdAt
lastUpdatedAt
expiresAt
staleCandidate
availableActions[]
```

`safeErrorMessage`는 기존 512자 제한과 PII scrub 정책을 따른다. Provider raw message를 그대로 전달하지 않는다.

## 권한

### Host

Host recovery endpoint와 기존 job action은 다음 조건을 모두 만족해야 한다.

- 현재 session의 club context와 `CurrentMember.clubId`가 일치한다.
- `CurrentMember.role == HOST`다.
- job이 요청한 `sessionId`에 속한다.
- job의 `hostUserId`가 action 정책상 필요한 경우 현재 user와 일치한다.

조회는 세션 단위로 제한한다. 호스트가 job id만 알고 있어도 다른 세션 job을 볼 수 없어야 한다.

### Platform Admin

Admin AI Ops read:

- `OWNER`
- `OPERATOR`
- `SUPPORT`

Admin AI Ops action:

- `OWNER`
- `OPERATOR`

`SUPPORT`는 AI Ops를 읽을 수 있지만 `force-cancel`을 실행할 수 없다. Support access grant로 합성된 club host 권한과 platform admin 권한은 섞지 않는다.

## Error Handling

Host 화면은 기존 RFC 7807 shape를 유지한다.

- `JOB_EXPIRED`: job이 만료되었으므로 새 job 시작 안내.
- `ILLEGAL_GENERATION_STATE`: 현재 상태에서 액션 불가, 최신 상태 refetch.
- `AI_DISABLED`: 외부 JSON 가져오기 fallback 안내.
- `QUEUE_UNAVAILABLE`/provider errors: 잠시 후 재시도 또는 운영자 문의 안내.

Admin 화면은 same code를 운영자 문맥으로 보여준다.

- stale candidate는 error가 아니라 diagnostic flag다.
- `force-cancel` 경합은 최신 상태와 함께 409로 반환한다.
- Redis 장애는 admin summary의 live-state section만 degraded로 표시하고, MySQL audit 기반 historical data는 계속 보여줄 수 있다.

Catch-all unknown error는 기존처럼 `UNKNOWN`과 safe detail만 반환한다. Stack trace, SQL detail, provider raw detail, transcript-derived issue text는 wire response에 넣지 않는다.

## UI Design

ReadMates의 design guide에 맞춰 quiet operating ledger 느낌을 유지한다.

### Admin AI Ops

구조:

1. AI Ops metric strip
2. recent job ledger
3. diagnostics panel
4. selected job detail drawer 또는 inline detail

Table/ledger는 dense하지만 과도한 SaaS dashboard처럼 보이지 않게 한다. 색만으로 상태를 구분하지 않고 badge text와 semantic label을 함께 사용한다.

필터:

- status
- club
- provider/model
- errorCode
- stale candidates

Admin action은 destructive action처럼 취급한다. `force-cancel`은 confirmation을 요구하고, action 후 ledger/detail/summary query를 invalidate한다.

### Host Recovery

`세션 기록 완성` 패널 안에 compact recovery strip을 둔다.

표시:

- current/recent job status
- stage/progress
- model
- failure code와 safe message
- expiresAt 또는 age
- safe next actions

액션:

- polling 재개
- 취소
- commit 재시도
- 새로 시작

Copy는 짧게 유지한다. 화면 안에서 AI 기능 설명이나 운영 내부 구조를 길게 설명하지 않는다.

## Testing

### Server

필수 테스트:

- host recent job endpoint가 session/club/role scope를 지킨다.
- host가 다른 세션 job id를 알아도 조회/액션할 수 없다.
- admin summary가 MySQL audit aggregate와 Redis live state를 결합한다.
- admin jobs list가 filter/cursor를 안정적으로 처리한다.
- `SUPPORT`는 AI Ops read 가능, action 불가.
- `OWNER`/`OPERATOR`는 eligible non-terminal job을 force-cancel할 수 있다.
- force-cancel은 terminal job 또는 missing Redis job에 safe error를 반환한다.
- Redis metadata index는 save/transition/delete 시 TTL과 membership을 갱신한다.
- DTO에 transcript/result/instructions/provider raw error가 포함되지 않는다.

명령:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server architectureTest
```

### Frontend

필수 테스트:

- archive/feedback/public query loader seeding과 invalidation.
- AI commit success가 `window.location.reload()`를 호출하지 않고 Query invalidation을 호출한다.
- host recovery strip이 job 상태별 액션을 정확히 보여준다.
- `/admin` AI Ops summary/jobs/detail이 loading/error/empty/degraded 상태를 렌더링한다.
- admin action 권한별 affordance가 다르다.
- filter/cursor query key가 안정적이다.

명령:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

### E2E

필수 시나리오:

- host AI start -> preview -> commit 후 full reload 없이 editor/feedback state가 갱신된다.
- host가 새로고침 후 in-flight/recoverable job을 다시 본다.
- `/admin` AI Ops read-only role은 action을 볼 수 없거나 실행할 수 없다.
- `/admin` OWNER/OPERATOR는 eligible job에 대해 force-cancel을 실행하고 ledger가 갱신된다.

명령:

```bash
pnpm --dir front test:e2e
```

## Release And Operational Notes

- DB migration은 audit index 보강과 `ai_generation_admin_action_audit` 추가가 필요한 경우에만 포함한다.
- Redis metadata index는 재생성 가능한 workflow state다. 유실 시 live recovery/admin active counts는 degraded될 수 있지만 durable audit과 기존 session/publication/member 데이터는 손상되지 않아야 한다.
- 운영자는 admin AI Ops를 incident triage 보조 도구로 사용한다. Redis raw cleanup은 여전히 runbook last resort다.
- CHANGELOG에는 user-visible host recovery, operator-visible AI Ops, reload 제거, Query migration 완료를 각각 기록한다.

## Acceptance Criteria

- `archive`, `feedback`, `public`가 Query migration status 문서에서 완료로 이동한다.
- host AI commit 후 full page reload가 없다.
- host는 자기 세션의 recoverable AI job을 다시 찾고 safe action을 실행할 수 있다.
- platform admin은 `/admin`에서 AI Ops summary, ledger, detail을 볼 수 있다.
- `OWNER`/`OPERATOR`만 admin action을 실행할 수 있고 `SUPPORT`는 read-only다.
- admin/host API 응답과 UI에 transcript, generated result raw JSON, provider raw error, secret, token, private deployment state가 노출되지 않는다.
- server and frontend checks plus E2E are run or skipped with explicit reason.

## Open Questions Resolved

- **AI Ops 위치**: `/admin` 전역 콘솔 + host session-scoped recovery를 둘 다 만든다.
- **구현 순서**: Query foundation을 먼저 끝낸 뒤 AI Ops UI를 얹는다.
- **호스트 액션 범위**: 제한형 recovery action을 제공한다. Raw cleanup은 제공하지 않는다.
- **admin action 범위**: 1차 범위는 `force-cancel`만 포함한다.
- **데이터 source**: MySQL audit은 durable evidence, Redis index는 live workflow state로 나눈다.
