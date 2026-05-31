# ReadMates Admin Club Triage Failure Counts (S3+ List Completion)

작성일: 2026-05-30
상태: APPROVED DESIGN SPEC

## 1. 배경

2026-05-29 operating-depth-reporting 로드맵은 슬라이스 순서를 **S3+ → S4+ → S6+ → S8**로 확정했다. 직전에 S3+ 1차분인 `/admin/clubs` 트리아지 목록(severity 정렬·필터·badge·E2E)이 shipped 됐다 (`2026-05-29-readmates-admin-club-ops-triage.md`).

그 트리아지 plan은 한 가지를 **명시적으로 deferred** 했다: 클럽별 *알림 실패*·*AI 실패* 카운트를 서버에서 집계해 severity에 반영하는 일. 현재 트리아지는 readiness/domain/host 신호만 쓰므로, 운영에서 가장 행동가능한 red 신호인 알림 실패·AI 실패가 빠져 있다. S3+ 목록 게이트("목록에서 red 신호가 있는 클럽을 즉시 식별")는 이 두 신호 없이는 절반만 닫힌 상태다.

이 문서는 그 deferred follow-up을 닫아 S3+ 목록 슬라이스를 완결하는 실행용 spec이다. 새 화면을 만들지 않는다. 기존 트리아지 목록에 두 개의 운영 신호를 더한다.

## 2. Source Documents

- 시퀀싱 로드맵: `docs/superpowers/specs/2026-05-29-readmates-admin-vnext-operating-depth-reporting-design.md` (slice S3+)
- 직전 shipped plan: `docs/superpowers/plans/2026-05-29-readmates-admin-club-ops-triage.md` (Deferred Follow-up 절)
- 아키텍처 source of truth: `docs/development/architecture.md`

## 3. 의사결정 (확정)

- **집계 시간 범위:** 최근 7일 윈도우. 알림·AI 실패 모두 7일 안의 실패만 카운트한다. 오래된 DEAD/FAILED 건이 클럽을 영구히 red로 고정하는 것을 막고, spec의 "최근-윈도우 컨텍스트" 의도와 일치한다.
- **Severity 매핑:** 실패 카운트 > 0 ⇒ critical. 알림/AI 실패는 멤버에게 직접 영향을 주므로 즉시 최상위로 노출한다. (트리아지 plan의 deferred 노트가 명시한 계약과 동일.)

## 4. Current Code State

서버 목록 어댑터:

- `server/.../club/adapter/out/persistence/JdbcPlatformAdminClubAdapter.kt`
  - `CLUB_BASE_SQL`이 `clubs` + `club_domains` 집계 LEFT JOIN + host onboarding state case로 `PlatformAdminClubListItem`을 만든다.
  - `listClubs(limit)`는 `CLUB_LIST_SQL`(BASE + order/limit), `loadClub(clubId)`는 `CLUB_BASE_SQL + where clubs.id = ?`를 쓴다. 두 경로 모두 같은 BASE_SQL을 공유하므로 BASE_SQL 확장 한 번이 목록·단건에 동시 반영된다.
  - `mapPlatformAdminClub`이 ResultSet → `PlatformAdminClubListItem` 매핑.

서버 모델/응답:

- `server/.../club/application/model/PlatformAdminModels.kt`의 `PlatformAdminClubListItem`: 현재 `domainCount`, `domainActionRequiredCount`, `firstHostOnboardingState`까지.
- `server/.../club/adapter/in/web/PlatformAdminClubController.kt`의 `PlatformAdminClubResponse.from(item)`이 동일 필드를 직렬화.

집계 대상 테이블 (인덱스 확인 완료):

- `notification_deliveries` (V20): `club_id`, `status` (`'EMAIL'`/`'IN_APP'` channel; status는 PENDING/.../FAILED/DEAD), `updated_at`. 인덱스 `notification_deliveries_club_status_idx (club_id, status, updated_at, created_at)`가 `where club_id and status in (...) and updated_at >= ?` 집계를 커버한다.
- `ai_generation_audit_log` (V30/V34): `club_id`, `status` (FAILED 포함), `created_at`. 인덱스 `idx_aigen_audit_club (club_id, created_at)`.

프론트:

- `front/features/platform-admin/model/platform-admin-domain-types.ts`의 `PlatformAdminClub` 타입.
- `front/features/platform-admin/model/platform-admin-club-triage-model.ts`: `clubTriageSeverity`, `clubTriageReasons`, `rankClubsByTriage`, `filterClubsBySeverity`, `CLUB_TRIAGE_LABEL`.
- `front/features/platform-admin/route/admin-clubs-route.tsx`: 모델 소비, badge·reason 렌더, severity 필터.

## 5. Scope

서버 (feature-local clean architecture, club 패키지 유지):

- `CLUB_BASE_SQL`에 LEFT JOIN 두 개 추가:
  - 알림 실패: `notification_deliveries`에서 `status in ('FAILED','DEAD') and updated_at >= utc_timestamp(6) - interval 7 day`를 `group by club_id`로 count → `notification_failure_count`.
  - AI 실패: `ai_generation_audit_log`에서 `status = 'FAILED' and created_at >= utc_timestamp(6) - interval 7 day`를 `group by club_id`로 count → `ai_failure_count`.
  - 둘 다 `coalesce(..., 0)`로 노출. 클럽 N+1 없는 단일 쿼리.
- `mapPlatformAdminClub`이 두 컬럼을 read.
- `PlatformAdminClubListItem`에 `notificationFailureCount: Int`, `aiFailureCount: Int` 추가.
- `PlatformAdminClubResponse`에 동일 두 필드 추가 (기본값 0).

프론트:

- `PlatformAdminClub` 타입에 `notificationFailureCount: number`, `aiFailureCount: number` 추가.
- `clubTriageSeverity`: critical 조건에 `notificationFailureCount > 0 || aiFailureCount > 0` 추가.
- `clubTriageReasons`: reason 목록 맨 앞에 `알림 실패 N건`, `AI 실패 N건`을 (각 카운트 > 0일 때만) 추가. 가장 행동가능한 신호를 먼저 노출한다.
- 기존 fixture/mock(E2E mock, 테스트 factory)에 두 필드의 안전 기본값(0)을 더한다.

## 6. Non-goals

- cap/flag write, kill-switch 등 admin write 동작 (S6+ 소관).
- 클럽 상세 스냅샷 재설계 — 상세는 이미 `notificationHealth`/`aiUsage`를 가진다. 이 슬라이스는 목록 측만 완결한다.
- 호스트 명령(세션 편집·출석·멤버 lifecycle)을 `/admin`으로 이전.
- 실패 raw error/원인 메시지, transcript, provider 응답 노출. 카운트만 노출한다.

## 7. Data Contract

| 필드 | 서버 model | 서버 response | 프론트 타입 | 의미 |
| --- | --- | --- | --- | --- |
| notificationFailureCount | `Int` | `Int` (기본 0) | `number` | 최근 7일 FAILED+DEAD 알림 배송 건수 |
| aiFailureCount | `Int` | `Int` (기본 0) | `number` | 최근 7일 FAILED AI 생성 audit 건수 |

서버 DTO, 프론트 types, fixtures, E2E mock이 동일 필드명과 shape을 쓴다.

## 8. Permissions And Public Safety

- 권한 변화 없음. 기존 `/admin/clubs` 목록과 동일 권한 매트릭스(OWNER/OPERATOR/SUPPORT read).
- 카운트 정수만 노출. provider raw error, transcript body, 생성 결과 JSON, 멤버 데이터, 사적 메시지 body, secret을 UI/응답/fixture/docs/테스트에 넣지 않는다.
- placeholder와 sanitized fixture만 사용한다.

## 9. Testing And Verification Gates

서버:

- `@Tag("integration")` 테스트가 FK 체인을 시딩해 윈도우 경계와 카운트 정확성을 검증한다:
  - `clubs` → `notification_event_outbox`(+`memberships`) → `notification_deliveries` (FAILED/DEAD, 7일 직전·이후 각각).
  - `ai_generation_audit_log` (FAILED, 7일 직전·이후).
  - 검증: 윈도우 안 실패만 카운트, 무실패 클럽은 0, FAILED/DEAD만 집계(PENDING/SENT 제외).
- 경계(패키지/슬라이스) 이동이 생기면 `architectureTest`.
- `./server/gradlew -p server unitTest` + 해당 integration test.

프론트:

- model 단위테스트: `notificationFailureCount > 0` 또는 `aiFailureCount > 0` ⇒ critical; reason 텍스트(`알림 실패 N건`/`AI 실패 N건`)와 reason 순서(실패 신호가 도메인/호스트 reason보다 앞).
- route 테스트: 실패 카운트가 있는 클럽이 badge·reason을 렌더하고 정렬 상위로 옴.
- 기존 트리아지 E2E 회귀.
- `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`.

릴리즈:

- CHANGELOG `Unreleased`에 shipped 동작 기술.
- 공개 릴리즈 영향: 변경 파일 대상 public-safety scan.

## 10. Dependency

- 선행: S3+ 트리아지 목록(shipped). 이 슬라이스는 그 위에 실패 신호를 더한다.
- 후속: 동일 두 카운트 계약을 S8 분석(알림 도달률·AI 비용/실패 추세)이 재사용할 수 있다. 안정적 필드명을 유지한다.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| 집계 JOIN이 목록 쿼리 성능 저하 | `group by club_id` 서브쿼리 + 기존 club_id/status/시간 인덱스 사용, 클럽 N+1 회피 |
| 오래된 실패가 클럽을 영구 red로 고정 | 7일 윈도우로 제한 |
| 단발 transient 실패가 critical 과잉 | 확정 계약(>0 ⇒ critical) 유지, 윈도우 7일로 노이즈 제한; 임계값은 후속 plan이 필요성 증명 시 |
| 실패 원인/raw error 유출 | 카운트만 노출, 메시지/transcript 비노출 |
| fixture가 새 필드 누락해 테스트 깨짐 | 모든 fixture/mock/factory에 기본값 0 추가 |

## 12. Next Step

이 spec이 리뷰된 뒤, 본 슬라이스의 implementation plan을 작성한다(writing-plans). plan은 이 문서 범위만 구현하고 S4+/S6+/S8로 확장하지 않는다.
