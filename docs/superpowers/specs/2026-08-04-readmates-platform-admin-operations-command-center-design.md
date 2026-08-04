# ReadMates 플랫폼 운영 지휘대 고도화 설계

작성일: 2026-08-04
상태: USER-APPROVED
대상 표면: platform admin, frontend, server API, MySQL/Flyway, responsive operations UX

## 1. 배경

ReadMates의 플랫폼 관리자 화면은 `/admin/today`, `/admin/health`, `/admin/clubs`, `/admin/support`, `/admin/notifications`, `/admin/ai-ops`, `/admin/audit`, `/admin/analytics`를 제공한다. 현재 각 화면은 클럽 공개 준비, 도메인 상태, 알림 실패, AI 작업, 지원 권한, 감사 이벤트 같은 개별 기능을 갖추고 있다.

그러나 화면 전체는 기능별 route와 카드가 누적된 형태다. 운영자가 실제로 답해야 하는 다음 질문을 하나의 흐름으로 해결하지 못한다.

- 지금 가장 먼저 처리할 일은 무엇인가?
- 왜 이 항목이 중요한가?
- 어느 클럽과 사용자에게 영향을 주는가?
- 현재 역할로 어떤 행동을 할 수 있는가?
- 실행 전에 무엇이 바뀌는지 확인했는가?
- 실행 이후 실제로 문제가 해결됐는가?

기존 `/admin/today`는 여러 read source를 조합해 작업 큐를 만들지만, 큐 항목의 확인·보류·해결·재개방 상태를 내구 저장하지 않는다. 다른 route의 조치도 개별 화면 안에서 끝나므로 탐지, 판단, 실행, 검증, 감사 사이의 연결이 약하다. 시각적으로도 같은 무게의 카드와 상태 요약이 반복돼 긴급도와 다음 행동의 위계가 충분히 드러나지 않는다.

이 설계는 플랫폼 관리자 화면을 기능 메뉴 모음에서 **운영 지휘대**로 전환한다. 중앙 우선순위 큐와 맥락 inspector를 기본 골격으로 사용하고, 위험한 작업에만 단계형 플레이북과 preview-confirm 절차를 적용한다.

현재 코드, 테스트, migrations, scripts, `docs/development/architecture.md`가 구현 시점의 source of truth다. 이 문서는 승인된 목표와 경계를 기록하는 설계 문서이며 아직 구현된 동작을 설명하지 않는다.

## 2. 승인된 방향

승인된 제품 방향은 다음과 같다.

1. 플랫폼 관리자 화면을 먼저 고도화하고, 검증된 원칙을 이후 클럽 호스트 화면에 적용한다.
2. `/admin/today`는 매일 조치할 문제를 빠르게 찾아 처리하는 기본 홈이 된다.
3. 시각 정돈에 그치지 않고 필요한 서버 API와 운영 상태 persistence를 포함한다.
4. 위험한 작업은 `미리보기 → 영향 범위 확인 → 최종 확정 → 감사 기록 → 후속 검증`을 기본 계약으로 사용한다.
5. 화면 골격은 운영 지휘대형 3영역 구조를 사용하고, 클럽 출시나 사건 복구 같은 위험 작업에만 플레이북을 삽입한다.
6. 전체 프로그램은 독립 수직 슬라이스로 나누며, 첫 구현 계획은 운영 지휘대 기반까지만 다룬다.

## 3. 목표와 성공 기준

### 3.1 목표

- 운영자가 첫 화면에서 열린 문제, 심각도, 영향 범위, 경과시간을 파악한다.
- 같은 원인의 반복 신호를 중복 카드가 아닌 하나의 지속 가능한 운영 케이스로 관리한다.
- 선택한 케이스에서 원인, 권한, 안전 조건, 다음 행동을 읽고 정확한 상세 route로 이동한다.
- 확인, 보류, 해결 확인, 재개방 이력을 보존한다.
- 일부 source 장애가 전체 운영 화면을 blank 처리하지 않게 한다.
- 기존 도메인 권한과 mutation 경계를 유지한다.
- desktop과 mobile 모두 운영 업무를 끝까지 수행할 수 있게 한다.
- ReadMates의 따뜻한 종이색, 잉크색, 차분한 운영 장부 정체성을 유지한다.

### 3.2 첫 구현 슬라이스 성공 기준

- `/admin/today`가 운영 케이스 큐와 선택 케이스 inspector를 제공한다.
- 케이스는 `OPEN`, `ACKNOWLEDGED`, `SNOOZED`, `RESOLVED` 상태를 가진다.
- 동일한 source identity는 중복 케이스를 만들지 않고 최신 관측 시각을 갱신한다.
- 해결된 신호가 다시 감지되면 같은 케이스가 재개방되고 재개방 횟수가 증가한다.
- 운영자는 케이스를 확인하거나 제한된 기간 동안 보류할 수 있다.
- 해결 확인은 source 신호가 실제로 사라졌거나 검증 가능한 실행 receipt가 있을 때만 성공한다.
- `/admin/today?case=<case-id>`로 선택 상태를 복원한다.
- 기존 `/admin/health`, `/admin/clubs`, `/admin/notifications`, `/admin/ai-ops`, `/admin/support`, `/admin/audit`, `/admin/analytics` route와 권한 경계는 유지된다.
- 1440px, 900px, 390px viewport에서 탐색, 큐, 상세, 상태 변경이 사용 가능하다.

## 4. 프로그램 분할

전체 고도화는 다음 순서로 진행한다.

### Slice 1. 운영 지휘대 기반

- 운영 장부형 admin shell과 정보 구조
- 운영 케이스 저장·집계 API
- `/admin/today` 큐와 inspector
- 확인·보류·해결 확인·자동 재개방
- 기존 상세 route로 context-preserving deep link
- desktop/mobile 반응형 구조

이 문서 이후 작성할 첫 구현 계획의 범위다.

### Slice 2. 클럽 출시 플레이북

- 기본 정보, 첫 호스트, 도메인, 공개 준비 검사를 하나의 진행 흐름으로 연결
- 단계별 완료 조건과 차단 사유
- 클럽 공개 preview-confirm
- 실행 receipt와 후속 공개 상태 검증

### Slice 3. 사건 복구 플레이북

- 동일 원인의 알림 실패 클러스터 재처리
- AI 작업 취소·복구
- 도메인 재검증
- 부분 성공과 실패 항목만을 대상으로 하는 안전한 재시도

### Slice 4. 지원·감사 완성도

- 지원 권한의 발급, 만료, 회수 흐름 보강
- 운영 케이스와 실행 receipt를 감사 ledger에 연결
- 반복 사건, 해결 시간, 재개방 추세 분석

### Slice 5. 클럽 호스트 운영 화면 확장

- 플랫폼 관리자 화면에서 검증된 정보 위계와 안전성 원칙을 회원, 회차, 출석, 알림 흐름에 맞게 적용
- 플랫폼 관리자 capability나 케이스 모델을 호스트 화면에 그대로 복제하지 않음

각 후속 slice는 별도 구현 설계와 계획을 갖는다. Slice 1에 후속 mutation을 미리 넣지 않는다.

## 5. Non-goals

- 일반 목적의 고객지원 티켓 시스템, 댓글, 채팅, 첨부파일 기능
- 클럽 호스트의 세션·멤버·알림 mutation을 platform admin에 복제
- 범용 `/execute` 또는 임의 action dispatch API
- raw email body, 원문 recipient, transcript, 생성 결과 JSON, provider raw error 노출
- UI affordance를 서버 권한 검사 대신 사용
- 무제한 bulk selection과 서로 다른 원인의 일괄 실행
- 장기 이중 route, 별도 v2 admin 앱, 전역 디자인 시스템 교체
- Slice 1에서 클럽 공개, 알림 재처리, AI 취소, 지원 grant mutation 계약 변경
- production deploy, 실제 이메일 발송, 실제 AI provider 호출, tag 또는 release 작업

## 6. 정보 구조

### 6.1 Global header

상단 header에는 다음만 유지한다.

- `ReadMates · 운영` wordmark
- 환경 또는 workspace 문맥
- 전체 source freshness
- 현재 platform role
- 계정·workspace 전환

동일 비중의 metric card strip은 제거한다. 전체 상태와 열린 조치 건수는 한 줄의 factual status로 압축한다.

### 6.2 좌측 탐색

탐색은 구현 기술이 아니라 운영 업무 기준으로 묶는다.

| 그룹 | 항목 | 책임 |
| --- | --- | --- |
| Command | 오늘 | 우선순위 케이스 큐와 선택 케이스 판단 |
| Command | 클럽 | 생성, 공개 준비, 도메인, 첫 호스트 온보딩 |
| Operations | 사건 | health, 알림, AI 작업과 복구 이력 |
| Operations | 지원 | 사용자 검색과 임시 지원 접근 |
| Review | 감사 | 실행자, 사유, 이전·이후 상태, receipt |
| Review | 분석 | 운영 추세와 클럽 aggregate 비교 |

기존 URL은 유지한다. 탐색 label과 grouping만 업무 기준으로 재구성한다.

### 6.3 `/admin/today` desktop

desktop은 세 영역으로 구성한다.

1. 좌측: global navigation
2. 중앙: 운영 케이스 큐
3. 우측: 선택 케이스 inspector

큐 행의 1차 정보는 제목, source, 영향 범위 요약, 심각도, 경과시간이다. 설명문, 전체 metadata, 모든 가능한 action을 한 행에 노출하지 않는다.

Inspector는 다음 순서를 따른다.

1. 문제 요약과 현재 상태
2. 영향 범위
3. 관측 근거와 최신성
4. 현재 역할의 capability
5. 다음 행동 또는 상세 route
6. 확인·보류·해결 상태 관리
7. 케이스 이력

### 6.4 Mobile

mobile에서는 3열을 축소하지 않는다.

```text
케이스 목록
  -> 케이스 상세
    -> 상태 변경 또는 상세 route
```

- 목록 첫 viewport에는 열린 수, 긴급 수, 내 작업 수와 상위 케이스가 나타난다.
- 상세 진입 후 back navigation이 필터와 scroll 위치를 보존한다.
- primary action은 최소 44px touch target을 갖는다.
- 최종 행동이 있는 후속 slice에서는 하단 action bar를 사용하되, 닫기·뒤로가기는 실행하지 않는다.

## 7. 시각 시스템

시각 방향은 **차분한 운영 장부**다.

- warm paper canvas와 cream surface
- ink 계열 텍스트 위계
- editorial type은 화면 제목과 문학적 identity에만 제한
- 운영 label, 수치, action은 읽기 쉬운 sans hierarchy
- 중첩 card보다 구획선, ledger row, 표면색 차이 사용
- 색은 심각도, source freshness, primary action에만 절제해 사용
- glow, glassmorphism, gradient hero, generic SaaS metric wall 금지
- 성공·0건 상태는 compact하게 축약하고 조치 필요 상태에 정보 밀도를 집중
- 영어 기술어와 한국어 UI label의 혼용을 줄이고 불가피한 source 이름만 보조 표기로 사용

심각도는 색만으로 표현하지 않는다. label, 아이콘, 시간, 상태 텍스트를 함께 제공한다.

## 8. 운영 케이스 모델

### 8.1 상태

```text
OPEN
  -> ACKNOWLEDGED
  -> SNOOZED
  -> RESOLVED

SNOOZED -- 만료 + 신호 존재 --> OPEN
RESOLVED -- 동일 신호 재감지 --> OPEN + reopenCount 증가
```

- `OPEN`: 아직 확인하지 않은 활성 신호
- `ACKNOWLEDGED`: 운영자가 확인했지만 신호가 여전히 활성
- `SNOOZED`: 지정 시각까지 큐 우선순위에서 잠시 제외
- `RESOLVED`: source 재검증으로 신호가 사라졌거나 검증 가능한 receipt가 존재

운영자가 live 신호를 단순히 숨기기 위해 `RESOLVED`로 바꿀 수 없다. 해결 확인 요청 시 서버가 source 상태를 다시 검증하며, 신호가 여전히 활성이라면 `409 CASE_STILL_ACTIVE`를 반환한다.

### 8.2 저장 필드

첫 migration은 다음 의미를 가진 `admin_operation_cases` table을 추가한다.

| 필드 | 의미 |
| --- | --- |
| `id` | public-safe opaque case id |
| `source_type` | allowlist된 signal source |
| `source_key` | source 안에서 안정적인 dedupe key |
| `club_id` | optional club scope |
| `severity` | `CRITICAL`, `WARNING`, `READY`, `INFO` |
| `state` | case lifecycle state |
| `first_observed_at` | 최초 감지 시각 |
| `last_observed_at` | 최신 감지 시각 |
| `acknowledged_at` | 확인 시각 |
| `snoozed_until` | 보류 만료 시각 |
| `resolved_at` | 해결 확인 시각 |
| `assignee_admin_id` | optional 담당 platform admin |
| `reopen_count` | 자동 재개방 횟수 |
| `version` | optimistic concurrency version |
| `safe_summary_code` | allowlist된 요약 code |
| `resolution_code` | allowlist된 해결 근거 code |

`source_type + source_key`는 active identity를 보장하는 unique contract를 갖는다. private content나 raw upstream error는 source key 또는 summary에 넣지 않는다.

### 8.3 Signal reconciliation

운영 case service는 기존 controller나 persistence adapter를 직접 호출하지 않는다. `OperationsSignalProvider` outbound port를 통해 safe signal projection을 읽는다.

```text
existing domain read models
  -> source-specific OperationsSignalProvider adapters
  -> OperationsCaseReconciliationService
  -> admin_operation_cases
```

Reconciliation 규칙:

1. 새 identity는 `OPEN` case를 만든다.
2. 기존 활성 identity는 `lastObservedAt`, severity, safe summary를 갱신한다.
3. snooze가 만료됐고 신호가 계속 존재하면 `OPEN`으로 되돌린다.
4. 신호가 보이지 않는다는 이유만으로 즉시 해결하지 않는다. source query가 성공했고 해당 identity의 부재를 신뢰할 수 있을 때만 해결 후보가 된다.
5. source query 실패 시 기존 case는 유지하고 source freshness를 `UNAVAILABLE`로 표시한다.
6. 해결된 identity가 다시 나타나면 같은 case를 재개방한다.

Slice 1의 초기 signal provider는 현재 `/admin/today`가 사용하는 source로 제한한다.

1. admin summary와 club registry 기반 공개 readiness, 도메인, 첫 호스트 온보딩 신호
2. admin notification snapshot 기반 club별 delivery 실패와 platform backlog 신호
3. AI capability, summary, job ledger 기반 failed 또는 stale job 신호
4. today closing-risk projection 기반 회차 마감 지연과 blocker 신호

AI 기능이 정책상 비활성인 상태는 장애 케이스가 아니다. Signal provider 자체의 조회 실패도 내구 케이스로 저장하지 않고 source freshness banner로 표현한다. 따라서 source가 복구됐을 때 가짜 해결 이력이나 재개방 횟수를 만들지 않는다.

## 9. Server architecture와 API

새 workflow는 기존 hexagonal 경계를 따른다.

```text
admin.operations.adapter.in.web
  -> admin.operations.application.port.in
  -> admin.operations.application.service
  -> admin.operations.application.port.out
  -> admin.operations.adapter.out.persistence / source
```

Application package는 controller, `JdbcTemplate`, repository 구현, HTTP type에 의존하지 않는다. Source adapter는 기존 domain의 safe query contract를 사용하거나 source별 outbound provider로 격리한다. 내부 HTTP self-call로 기존 API를 다시 호출하지 않는다.

### 9.1 Slice 1 API

```text
GET  /api/admin/operations/cases
GET  /api/admin/operations/cases/{caseId}
POST /api/admin/operations/cases/{caseId}/acknowledge
POST /api/admin/operations/cases/{caseId}/snooze
POST /api/admin/operations/cases/{caseId}/resolve
```

목록 query는 다음 filter를 지원한다.

- `state`
- `severity`
- `source`
- `assignee`
- opaque `cursor`
- bounded `limit`

목록과 상세 응답은 다음을 포함한다.

- safe title과 summary code
- severity와 lifecycle state
- first/last observed time과 age
- club scope의 public-safe identity
- aggregate impact counts
- source freshness
- permitted case actions
- canonical detail link
- optimistic version

Mutation은 expected version을 요구한다. 다른 운영자가 먼저 변경했으면 `409 CASE_VERSION_CONFLICT`로 fail closed하고 최신 case를 다시 읽게 한다.

### 9.2 도메인 mutation 경계

Slice 1은 기존 도메인 mutation을 실행하지 않는다. 후속 slice에서도 범용 action endpoint를 만들지 않는다.

- 클럽 공개는 club application service가 소유한다.
- 알림 replay는 notification application service가 소유한다.
- AI job 취소·복구는 aigen application service가 소유한다.
- 지원 grant는 기존 authorization boundary가 소유한다.
- 도메인 marker check는 club domain workflow가 소유한다.

운영 case는 canonical detail link, case state, 검증 reference를 제공한다. 도메인 mutation의 preview-confirm contract는 각 후속 slice 문서에서 구체화한다.

## 10. Frontend architecture

기존 route-first 방향을 유지한다.

```text
src/app/routes/admin.tsx
  -> features/platform-admin/route
  -> features/platform-admin/queries + model
  -> features/platform-admin/ui
```

예상 단위:

- `api/platform-admin-operations-api.ts`
  - case list/detail/lifecycle request와 response contract
- `queries/platform-admin-operations-queries.ts`
  - query keys, list/detail options, lifecycle mutation, invalidation
- `model/platform-admin-operations-model.ts`
  - severity order, age label, filter model, source label, mobile summary
- `route/admin-today-route.tsx`
  - URL filter와 selected case, query coordination, navigation
- `ui/admin-operations-queue.tsx`
  - prop-driven filter와 ledger rows
- `ui/admin-operations-inspector.tsx`
  - safe detail, freshness, capability, history
- `ui/admin-operation-state-actions.tsx`
  - acknowledge, snooze, resolve-confirm controls
- `ui/admin-operation-mobile-detail.tsx`
  - mobile list/detail flow

UI module은 API, query hook, route module, `fetch`를 import하지 않는다.

### 10.1 URL state

```text
/admin/today?case=<case-id>&state=open&severity=critical&source=notification
```

- URL은 선택 케이스와 주요 filter를 보존한다.
- 존재하지 않거나 접근할 수 없는 case id는 첫 허용 항목으로 안전하게 fallback하고 URL을 replace한다.
- filter 결과에서 선택 case가 빠지면 selection을 명시적으로 해제하거나 첫 항목으로 이동한다.
- browser back/forward는 선택과 filter를 복원한다.

### 10.2 Query 갱신

- 활성 `/admin/today` route와 visible tab에서만 bounded polling을 수행한다.
- 갱신 중 현재 list와 selection을 유지한다.
- detail source가 실패해도 list는 유지한다.
- lifecycle mutation 성공 후 case list/detail과 관련 summary key를 invalidate한다.
- SSE나 WebSocket은 Slice 1에 추가하지 않는다.

## 11. 위험 작업 preview-confirm 계약

이 절은 후속 slice가 따라야 할 공통 설계다. Slice 1의 case lifecycle mutation 가운데 resolve는 source 재검증을 사용하지만 selection hash 기반 bulk action을 만들지 않는다.

위험 작업 preview는 다음 값을 가진다.

- opaque preview id
- selection hash
- 대상 revision 또는 version
- aggregate impact count
- skipped, blocked, missing count
- actor와 capability snapshot
- 10분 이내 expiry

Confirm은 다음 조건에서 거절한다.

- preview 만료
- selection 또는 revision 변경
- actor capability 변경
- 다른 운영자가 먼저 처리
- case가 해결 또는 재개방됨
- source freshness가 확정에 안전하지 않음

닫기, backdrop, Escape, navigation, preview 자체는 mutation을 실행하지 않는다. Confirm request는 idempotency key를 사용하며 결과는 전체 성공, 일부 성공, 전체 실패, 이미 처리됨, 새 preview 필요를 구분한다.

## 12. 오류와 상태

### 12.1 Partial source failure

하나의 signal provider 실패가 전체 today route를 막지 않는다.

- 성공한 source case는 계속 표시한다.
- 실패한 source는 `확인 불가`와 마지막 정상 시각을 표시한다.
- 기존 case를 자동 해결하지 않는다.
- retry는 실패 source에만 수행할 수 있다.

### 12.2 필수 UI 상태

- 최초 loading
- background refresh
- 정상과 honest empty
- stale data
- partial source unavailable
- permission denied
- optimistic version conflict
- mutation pending
- resolution verification pending
- success
- partial failure
- resolved
- reopened

Error copy는 stack trace, SQL detail, upstream hostname, raw provider error, secret, token-shaped value, private member data를 노출하지 않는다.

## 13. 권한

프런트엔드는 role 문자열이 아니라 서버가 반환한 capability를 기준으로 control을 노출한다. 서버는 모든 mutation에서 현재 actor와 capability를 다시 확인한다.

초기 의도:

| 행동 | OWNER | OPERATOR | SUPPORT |
| --- | --- | --- | --- |
| case와 safe metadata 조회 | 허용 | 허용 | 허용 |
| acknowledge | 허용 | 허용 | 읽기 전용 |
| snooze | 허용 | 허용 | 읽기 전용 |
| resolve 검증 요청 | 허용 | 허용 | 읽기 전용 |
| assignee 변경 | 허용 | 허용 | 읽기 전용 |
| 고위험 도메인 mutation | 기존 capability 적용 | 기존 capability 적용 | 기존 capability 적용 |

구현 전 현재 `platform-admin-permissions`와 server authorization 정책을 다시 확인한다. 기존 권한을 암묵적으로 확장하지 않는다.

## 14. 접근성과 카피

- route마다 명확한 `h1`과 landmark를 제공한다.
- queue row는 keyboard로 선택 가능하고 접근 가능한 이름을 가진다.
- 선택 상태는 색 외에 `aria-current` 또는 동등한 semantic으로 노출한다.
- source unavailable, mutation error, conflict는 `status` 또는 `alert` 영역에 노출한다.
- focus order는 navigation, queue, inspector의 시각 순서를 따른다.
- desktop과 mobile 모두 visible focus와 WCAG AA 대비를 유지한다.
- 한글과 영문 identifier가 control 밖으로 넘치지 않게 한다.
- 긴 설명보다 상태, 이유, 영향, 다음 행동을 짧게 쓴다.
- `Platform Health`, `Failure clusters`, `Replay`처럼 혼재된 label은 사용자에게 필요한 source 명칭이 아니라면 한국어 중심으로 정리한다.

## 15. 검증 전략

### 15.1 Model과 UI

- severity와 age ordering
- source identity dedupe
- filter와 URL round trip
- empty, stale, partial failure, permission state
- selection preservation during refresh
- desktop queue/inspector와 mobile list/detail
- unnamed interactive element 없음

### 15.2 Server unit와 integration

- 신규 signal creates case
- repeated signal updates existing case
- source failure does not resolve case
- snooze expiry reopens active case
- resolved signal reappears and increments reopen count
- resolve rejects active source
- optimistic version conflict
- OWNER/OPERATOR/SUPPORT authorization
- migration, unique identity, cursor ordering, concurrent reconciliation
- allowlist projection and private sentinel exclusion

### 15.3 Route와 E2E

- `/admin/today?case=...` direct entry와 refresh
- browser back/forward filter restoration
- OWNER와 OPERATOR lifecycle mutation
- SUPPORT denied mutation
- partial source failure with remaining queue usable
- 1440x1000, 900x900, 390x844 screenshot evidence
- mobile list → detail → back flow
- Escape, close, navigation이 mutation을 실행하지 않음

### 15.4 Canonical gates

구현 시 focused test를 먼저 실행한 뒤 다음 gate를 적용한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

실제 영향 표면에 맞춰 `docs/development/acceptance-matrix.md`의 platform admin, authorization, migration, responsive UI, public-safety evidence를 선택한다. 실행하지 못한 command는 통과로 기록하지 않는다.

## 16. 배포 순서와 관측

배포가 별도로 승인되면 다음 순서를 따른다.

1. additive Flyway migration과 server API 배포
2. migration, health, authorization, API contract 확인
3. frontend shell과 `/admin/today` 전환
4. desktop/mobile smoke
5. source failure와 lifecycle metrics 확인

기존 admin route는 유지되므로 frontend 전환 전 server 배포가 기존 browser를 깨뜨리지 않는다. 장기 dual UI나 별도 feature fork를 만들지 않는다.

필요한 운영 지표:

- active case count by source/severity (`RESOLVED`를 제외한 모든 lifecycle state)
- source reconciliation success/failure
- case age
- acknowledge time
- resolve verification success/conflict
- reopen count
- provider freshness

Metric label에는 case summary text, email, member identity, raw domain, token, provider raw error를 넣지 않는다.

## 17. 첫 구현 계획의 경계

이 설계 승인 후 작성할 구현 계획은 Slice 1만 실행 가능하게 만든다.

포함:

- schema와 case lifecycle
- signal provider abstraction과 위에 고정한 네 초기 provider
- list/detail/lifecycle API
- frontend query/model/UI
- admin shell과 route navigation 재구성
- responsive/accessibility/E2E evidence
- architecture와 active docs 동기화

제외:

- 실제 클럽 공개 preview-confirm
- 알림 replay 계약 변경
- AI job action 계약 변경
- 지원 grant 정책 변경
- host app 재설계
- production deploy와 실제 user-impacting smoke

후속 slice가 필요로 하는 경계는 이 문서에 정의하지만, Slice 1 구현에 미연결 button이나 동작하지 않는 메뉴를 추가하지 않는다.
