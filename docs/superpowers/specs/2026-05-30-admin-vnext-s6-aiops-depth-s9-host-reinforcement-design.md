# Admin vNext S6 AI Ops Depth 완주 + S9 Host-surface 보강 (엄브렐라 스펙)

작성일: 2026-05-30
상태: APPROVED DESIGN SPEC

## 1. 목적 & 기존 차터 관계

이 스펙은 새 로드맵을 만들지 않는다. `docs/superpowers/specs/2026-05-30-admin-vnext-closeout-execution-charter-design.md`(이하 charter)가 고정한 실행 순서 S6 → S9 → S10을 **구현 수준으로 펼친 단일 엄브렐라 스펙**이다.

- charter §1은 이미 S6→S9를 "하나의 엄브렐라 실행 계약"으로 선언했다. 이 스펙은 그 엄브렐라 안에서 **남은 S6 깊이 목표(charter §4.2의 T2/T3/T4)와 S9**를 슬라이스로 정의한다.
- charter §10 원칙을 따른다: **하나의 스펙 → 슬라이스별 독립 implementation plan**. 단일 거대 plan으로 뭉치지 않는다.
- charter와 충돌하면 charter가 우선한다.

성공 기준은 "화면 수가 늘었다"가 아니라, 이미 shipped된 `/admin/ai-ops` 표면이 일관된 운영 품질로 닫히고 admin·host 신호가 갈라지지 않는 것이다(charter §1).

이미 완료: **S6 P1 — AI Ops 실패 코드 드릴다운**(`?errorCode=` 필터 연결, 커밋 `bffecbd2` 머지).

## 2. Source Documents

- Charter(시퀀싱 source): `docs/superpowers/specs/2026-05-30-admin-vnext-closeout-execution-charter-design.md`
- Closeout 로드맵: `docs/superpowers/specs/2026-05-30-readmates-admin-vnext-closeout-roadmap-design.md`
- S8 분석 슬라이스(윈도우/델타 패턴 참조): `server/src/main/kotlin/com/readmates/admin/analytics/`
- Architecture source of truth: `docs/development/architecture.md`
- Surface guides: `docs/agents/front.md`, `docs/agents/server.md`, `docs/agents/design.md`

## 3. 슬라이스 구성 & 실행 순서 (확정)

```text
Slice A (S6-T2) 비용/사용량 윈도우 추세
Slice B (S6-T3) stale job 조치 깊이 (admin retry)
Slice C (S6-T4) 표면 연결성 (health/audit → ai-ops)
  ── A·B·C 는 S6, 서로 독립 머지/검증 ──
Slice D (S9)    Host-surface 보강 (공유 club-ops 계약)
```

- 실행 순서: **A → B → C (S6) → D (S9)**. charter §3 순서(S6→S9)를 상속한다.
- 각 슬라이스는 자기 implementation plan을 받고 독립적으로 머지·검증 가능하다.
- 스펙 승인 후 **첫 plan은 Slice A만** 작성한다. 나머지 슬라이스는 current가 될 때 자기 plan을 받는다(charter §10).
- cross-cutting 하드닝(§7)은 슬라이스가 건드린 표면에 한해 각 plan의 gate에 첨부한다. 전면 retrofit이 아니다.

## 4. 현재 코드 상태 (검증된 기준선)

- AI Ops 서버 슬라이스: `server/src/main/kotlin/com/readmates/aigen/`의 `AiGenerationOpsService`/`AiGenerationOpsController`/`AiOpsModels`.
  - `summary()`는 `monthToDateCostEstimateUsd`를 월초(`monthStart`) 기준 단일값으로 계산한다.
  - admin action은 `AiOpsAction.FORCE_CANCEL` 단일. `ACTION_ROLES = {OWNER, OPERATOR}`. `adminActionAuditPort.record(...)`로 audit 기록.
- 프런트 계약: `front/features/platform-admin/model/platform-admin-domain-types.ts`.
  - `PlatformAdminAiOpsAction = "FORCE_CANCEL"`.
  - `PlatformAdminAiOpsSummaryResponse`: `activeJobCount`, `failedLast24h`, `monthToDateCostEstimateUsd`, `failureCodes[]`, `providerCosts[]`, `staleCandidateCount`.
  - `PlatformAdminAiOpsFilters`: `status`, `clubId`, `errorCode`, `cursor` (P1 드릴다운이 사용).
- 호스트 복구: `front/features/host/aigen/ui/AiRecoveryStrip.tsx`의 actions `POLL`/`CANCEL`/`COMMIT_RETRY`/`START_NEW`. 호스트는 자기 세션 in-flight job을 재시도/취소할 수 있다.
- 분석 윈도우 패턴: `AnalyticsWindow(LAST_7D/30D/90D, wire="7d|30d|90d")`. adapter는 raw count/cost만 반환하고 service가 rate/delta/availability를 순수 파생한다(`AdminAnalyticsRawAggregates` → `AdminAnalyticsKpiCard`). 분모 0이면 `Availability.NOT_ENOUGH_DATA`, `DeltaDirection.{UP,DOWN,FLAT,NONE}`.
- club operations 계약: `front/features/platform-admin/model/platform-admin-club-operations-model.ts`가 platform-admin feature 소유. `aiUsage`(activeJobs/failedRecentJobs/staleCandidates/costEstimateUsd/state/priorFailedJobs7d) 등 신호 포함.

## 5. 슬라이스별 설계

### 5.1 Slice A — 비용/사용량 윈도우 추세 (S6-T2)

목표: `monthToDateCostEstimateUsd` 단일값을 **윈도우 추세**로 확장한다(charter §4.2-2).

- **서버**
  - `GetAiOpsSummaryUseCase.summary(admin, window)`에 window 파라미터 추가. window는 aigen 슬라이스 **로컬 enum**(`7d|30d|90d`)으로 정의한다 — 분석 슬라이스 enum을 import하지 않는다(슬라이스 간 결합 방지, 커밋 `a34419ce`의 framework-independent 필터 원칙 유지).
  - adapter(`AiGenerationAuditQueryPort`)에 current/prior 윈도우의 raw 비용·job 카운트 조회를 추가한다. service가 순수 델타·availability를 파생한다(S8과 동일한 raw→derive 분리). 분모(prior) 0이면 `NOT_ENOUGH_DATA`.
  - 응답에 `costTrend` 블록 **추가**: `window`, `currentCostUsd`, `priorCostUsd`, `currentJobCount`, `priorJobCount`, `deltaDirection`, `availability`. 색 의미(good/bad)는 UI가 정한다.
  - `monthToDateCostEstimateUsd` 헤드라인은 **유지**한다(비파괴 확장). 기존 `failureCodes`/`providerCosts` 스코프는 변경하지 않는다.
- **프런트**
  - `PlatformAdminAiOpsSummaryResponse`에 `costTrend` 타입 추가. `?window=` URL state로 윈도우 선택(분석 라우트와 동일 UX).
  - 추세는 **current-vs-prior 델타 텍스트/badge**로 표시한다. **차트 라이브러리 미추가**(charter §4.2-2, Risk 표).
  - 데이터가 얇으면 추세를 지어내지 않고 "데이터 부족" empty state.
- **Non-goals**: 차트 라이브러리, provider raw error 노출, 상태머신 변경.

### 5.2 Slice B — stale job 조치 깊이 / admin retry (S6-T3)

목표: admin 조치를 `FORCE_CANCEL` 단일에서 host의 cancel/retry와 일관된 조치로 강화한다(charter §4.2-3).

> **재정의 노트 (2026-05-30, 코드 검증 후 확정)**: charter §4.2-3과 이 절의 초안은 "기존 host commit-retry use-case에 위임"을 전제했으나, **그런 서버 use-case는 존재하지 않는다**. host의 `COMMIT_RETRY`는 순수 프런트 액션(commit UI 재진입 후 host가 `recordVisibility`를 직접 골라 `POST /jobs/{jobId}/commit` 재호출)이다. admin이 이를 그대로 위임하면 (1) host의 member-facing `recordVisibility` 결정을 admin이 대신하고 (2) 생성 콘텐츠를 admin이 클럽 세션에 write 하게 되어 charter §5.3 non-goal("host가 admin 대체 금지"의 역방향)과 충돌한다. 따라서 admin `RETRY_COMMIT`의 의미를 **stuck `COMMITTING` 잡의 복구 전이**로 확정한다: `COMMITTING → SUCCEEDED`로 되돌려 host가 직접 재커밋할 수 있게 unblock 한다. 이 전이는 `AiGenerationCommitService`가 모든 내부 실패 경로에서 이미 쓰는 복구 전이(`COMMITTING → SUCCEEDED`)와 동일하다 — 새 terminal state·전이 의미를 도입하지 않는다.

- **서버**
  - `AiOpsAction`에 `RETRY_COMMIT` 추가.
  - 새 use-case `RetryAiOpsJobCommitUseCase.retryCommit(admin, jobId)`를 OWNER/OPERATOR로 role-gate한다(`ACTION_ROLES` 재사용).
  - 동작: 라이브 잡을 로드해 status가 `COMMITTING`일 때만 `jobStore.transitionStatus(expected = {COMMITTING}, next = SUCCEEDED, stage = READY, progressPct = 100, error = null)`로 되돌린다. **transient payload는 삭제하지 않는다**(host가 재커밋하려면 result 스냅샷이 살아 있어야 한다 — force-cancel과의 핵심 차이). `adminActionAuditPort.record(...)`로 `action = "RETRY_COMMIT"`, `previousStatus = COMMITTING`, `nextStatus = SUCCEEDED` audit를 남긴다.
  - `availableActions`를 status별로 계산한다: `RETRY_COMMIT_STATUSES = {COMMITTING}`. `COMMITTING` 잡은 `FORCE_CANCEL`과 `RETRY_COMMIT`를 모두 노출한다.
  - worker/commit 로직을 복제하지 않는다 — 상태 전이만 수행하고 실제 재커밋은 host 경로에 맡긴다.
- **프런트**
  - `PlatformAdminAiOpsAction`에 `RETRY_COMMIT` 추가. ai-ops job 행에서 `availableActions.includes("RETRY_COMMIT")`일 때 OWNER/OPERATOR에게 버튼 노출. 톤은 기존 force-cancel 버튼과 맞춘다.
- **Non-goals**: worker/commit 로직 복제, admin이 콘텐츠를 직접 커밋(=host commit 대행), provider raw error/transcript 노출, transient payload 삭제.

### 5.3 Slice C — 표면 연결성 (S6-T4)

목표: `/admin/health`·`/admin/audit`의 AI 신호가 `/admin/ai-ops` 드릴다운으로 원인→조치까지 이어지게 한다(charter §4.2-4).

- 거의 프런트 글루: `/admin/health` AI 카드와 `/admin/audit` AI-source 행에 P1 필터 모델(`?errorCode=`/`?clubId=`/`?status=`)로 `/admin/ai-ops` 딥링크를 추가한다.
- 신규 서버 계약은 최소화한다. 기존 audit/health 응답이 드릴다운에 필요한 키(errorCode/clubId)를 이미 노출하는지 확인하고, 없으면 안전 metadata projection 범위에서만 보강한다(raw provider error/email/transcript 비노출).
- **Gate**: health/audit AI 신호 → ai-ops 드릴다운이 원인·조치로 이어진다(e2e). 필터 적용 후 빈 결과는 정직한 empty state.

### 5.4 Slice D — Host-surface 보강 (S9)

목표: S3 club operations 신호 중 host-적절 부분을 host 화면에서 재사용한다(charter §5.2).

- **선결 — 중립 계약 owner 선정**: 현재 club-operations 계약은 platform-admin feature 소유다. host-적절 subset을 중립 위치로 분리한다. 위치 후보 `front/features/_shared/club-operations`(또는 프로젝트 컨벤션에 맞는 shared 루트). admin·host 양쪽이 이 중립 계약을 import하고, **frontend boundary test로 import cycle 부재를 강제**한다. (위치 최종 결정은 Slice D plan에서 기존 shared 컨벤션 확인 후 확정.)
- **Scope**: host 화면은 S3 신호 중 host-적절 부분(예: 자기 클럽 readiness/세션/AI 사용량 요약)을 **read-only**로 재사용한다. 서버는 host-scoped projection(자기 클럽만)으로 반환하고 admin 전용 신호(support grant, raw member email, notification replay)는 제외한다.
- **Non-goals**(charter §5.3): admin write 명령을 host로 이전 금지, host가 admin 역할 대체 금지, 신규 host CRUD 끼워넣기 금지.
- **Gate**: 공유 계약이 admin·host 양쪽에서 cycle 없이 동작(boundary test), host와 admin이 동일 신호를 동일 의미로 표시.

## 6. 계약 안전 (모든 슬라이스)

- server DTO · frontend type · fixture · E2E mock이 동일 필드명/shape.
- provider raw error, transcript body, 생성 결과 JSON, raw member email은 응답·UI·docs·fixture 어디에도 노출하지 않는다. placeholder·sanitized fixture만 사용한다.
- admin write 조치(Slice B)는 originating 슬라이스에서 audit-ready다.

## 7. 공통 하드닝 게이트 (charter §6, 건드린 표면 한정)

- **일관성**: 카드·테이블·필터·badge 톤이 admin shell의 calm operating-ledger 톤과 일치.
- **접근성**: 키보드 포커스 순서, aria 라벨, 색 대비.
- **모바일**: desktop·mobile 레이아웃 모두 검증.
- **Empty/에러**: 데이터가 얇을 때 정직한 empty state, 안전한 실패 카피.

## 8. 검증 & 릴리즈 안전 (charter §8 상속, 슬라이스별)

공통 회귀:

- Frontend: `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`.
- Server: `./server/gradlew -p server unitTest`, 경계 이동 시 `architectureTest`.
- Auth/BFF/user-flow 라우트: `pnpm --dir front test:e2e`.
- 동작 변경 시 CHANGELOG `Unreleased`와 관련 운영 docs 갱신.

슬라이스별 minimum checks:

- **A**: 윈도우 비용 델타·availability의 service·adapter 단위 테스트. 분모 0 → `NOT_ENOUGH_DATA`. 컨트롤러 window 파라미터 테스트. e2e: window 토글로 추세 갱신.
- **B**: retry 전이가 기존 host 경로에 위임됨을 검증하는 단위 테스트. 권한 거부(SUPPORT/member) 및 masked 응답 테스트. retry 후 admin audit row 생성 검증. e2e: ai-ops에서 retry 액션 happy path.
- **C**: health/audit AI 신호 → ai-ops 드릴다운 e2e. 필터 round-trip(원인→조치).
- **D**: 중립 계약에 대한 frontend boundary test(import cycle 부재). host 화면이 S3 신호를 동일 의미로 표시하는 단위/route 테스트. e2e: host 표면에서 공유 운영 신호 렌더링.

## 9. Risks

| Risk | Where | Mitigation |
| --- | --- | --- |
| AI Ops가 raw provider error/transcript 노출 | A·B·C | masked 응답, 안전한 실패 카피, fixture public-safety 스캔 |
| 비용/추세가 인위적이거나 빈약 | A | 윈도우 델타 재사용, 정직한 empty state, 차트 라이브러리 미추가 |
| admin retry가 상태머신 의미를 바꿈 | B | 기존 host commit-retry 전이에 위임, 새 terminal/전이 도입 금지 |
| host/admin 계약 분기와 import cycle | D | 중립 계약 owner 선정 후 boundary test |
| admin 명령이 host로 새어 host가 admin 대체 | D | host는 read 재사용만, write 명령 비이전 |
| 하드닝이 전면 retrofit으로 번짐 | All | 슬라이스가 건드린 표면에 한해 적용 |
| 엄브렐라가 단일 거대 plan으로 뭉침 | All | 슬라이스별 독립 plan, 독립 머지/검증 |
| 공개 저장소 안전성 회귀 | All | 변경 파일 대상 public-safety 스캔 |

## 10. Next Step

스펙 승인 후 **Slice A (S6-T2 비용/사용량 윈도우 추세) implementation plan만** 작성한다(writing-plans). Slice A plan은 B/C/D를 구현하지 않는다. B·C·D는 current가 될 때 각자 plan을 받는다. S10은 charter §7 결정 게이트로만 남으며 이 스펙 범위에서 빌드하지 않는다.
