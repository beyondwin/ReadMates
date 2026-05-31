# ReadMates Admin Club Detail Trend Completion (S3+ Detail Closure)

작성일: 2026-05-30
상태: APPROVED DESIGN SPEC

## 1. 배경

2026-05-29 operating-depth-reporting 로드맵은 슬라이스 순서를 **S3+ → S4+ → S6+ → S8**로 확정했다. S3+의 *목록* 절반은 두 단계로 shipped 됐다: 트리아지 목록(severity 정렬·필터·badge)과 그 뒤를 잇는 클럽별 알림·AI 7일 실패 카운트(`2026-05-30-readmates-admin-club-triage-failure-counts-design.md`). 목록에서 red 클럽을 즉시 식별하는 게이트는 닫혔다.

그러나 S3+ Gate는 목록만으로 닫히지 않는다. 2026-05-29 로드맵의 S3+ Gate는 다음을 추가로 요구한다:

- "상세의 모든 red 신호가 다음 조치 라우트(S5/S6/호스트 표면)로 연결된다."
- "단일 시점 스냅샷에 최소한의 최근-윈도우 컨텍스트(예: 최근 실패 추이 요약)를 더해 '추세 판단'이 가능하도록."
- "플랫폼-소유 metadata/readiness와 호스트-소유 클럽 운영이 UI에서 구분된다."

현재 `/admin/clubs/:clubId` 상세 스냅샷(`admin.club_operations_snapshot.v1`)은 이 세 항목을 절반만 만족한다. 이 문서는 그 detail 측을 완결해 S3+ 슬라이스를 닫는 실행용 spec이다. 새 라우트를 만들지 않고, 기존 상세 스냅샷에 최근-윈도우 추이와 next-action 연결을 더한다.

## 2. Source Documents

- 시퀀싱 로드맵: `docs/superpowers/specs/2026-05-29-readmates-admin-vnext-operating-depth-reporting-design.md` (slice S3+)
- 직전 목록 완결 spec: `docs/superpowers/specs/2026-05-30-readmates-admin-club-triage-failure-counts-design.md`
- 아키텍처 source of truth: `docs/development/architecture.md`
- 프론트 가이드: `docs/agents/front.md`
- 서버 가이드: `docs/agents/server.md`
- 디자인 가이드: `docs/agents/design.md`

## 3. 의사결정 (확정)

- **집계 윈도우 재사용:** 상세 스냅샷의 알림·AI 실패 신호는 목록과 **동일한 7일 윈도우 정의**를 쓴다. 알림은 `status in ('FAILED','DEAD') and updated_at >= now-7d`, AI는 `status='FAILED' and created_at >= now-7d`. 목록의 `notificationFailureCount`/`aiFailureCount`와 숫자가 일치해 "목록 red → 상세가 같은 신호를 설명"이 성립한다.
- **델타:** 추이 판단을 위해 직전 7일 윈도우(now-14d ~ now-7d) 카운트를 하나 더 집계한다. `delta = recent - prior`는 프론트 순수 계산.
- **스키마:** additive. `schema` 리터럴 `admin.club_operations_snapshot.v1`을 유지한다. 기존 필드를 보존한 채 신규 필드만 더한다. 소비자 파괴 변경 없음.
- **요약 "알림 실패" metric:** 전체 기간 `failed+dead`에서 **7일 윈도우 카운트**로 교체한다. 전체 기간 failed/dead는 상세 패널에 유지한다.
- **readiness next-action:** 서버는 blocker 코드(`HOST_REQUIRED`/`DOMAIN_ACTION_REQUIRED`/`CLUB_NOT_ACTIVE`)를 유지하고, **프론트가 blocker 코드 → 안전 라우트로 매핑**한다(UI가 라우트 소유 원칙).

## 4. Current Code State

서버:

- `server/.../club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt`
  - `notificationHealth(clubId)`의 `failed`/`dead`/`failureClusters`는 **전체 기간** 집계다(윈도우 없음).
  - `aiUsage(clubId)`의 `failedRecentJobs`는 이미 7일 윈도우(`created_at >= now-7d`)다. 직전 7일 카운트는 없다.
  - `readiness(clubId, club)`는 blocker 목록과 `nextAction = blockers.firstOrNull()`(코드 문자열)을 반환한다.
- `server/.../club/application/model/AdminClubOperationsModels.kt`
  - `AdminClubNotificationHealth(pending, failed, dead, lastSuccessAt, failureClusters)`.
  - `AdminClubAiUsage(activeJobs, failedRecentJobs, staleCandidates, costEstimateUsd, state)`.
- `server/.../club/adapter/in/web/PlatformAdminClubOperationsController.kt`이 스냅샷을 직렬화.

프론트:

- `front/features/platform-admin/model/platform-admin-club-operations-model.ts`의 `AdminClubOperationsSnapshot` 타입.
- `front/features/platform-admin/ui/admin-club-operations-page.tsx`
  - 요약 "알림 실패" metric이 `notificationHealth.failed + notificationHealth.dead`(전체 기간)를 쓴다.
  - 알림/AI 패널에 `/admin/notifications?clubId=`, `/admin/ai-ops?clubId=` 드릴다운 링크가 이미 있다.
  - `readiness.blockingReasons`를 plain text span으로만 렌더한다(링크 없음). `readiness.nextAction`은 렌더되지 않는다.
  - 세션/멤버(호스트 소유)와 readiness/도메인(플랫폼 소유)이 시각적으로 구분되지 않는다.
- `front/features/platform-admin/route/admin-club-detail-route.tsx`이 스냅샷 쿼리를 소비.

## 5. Scope

서버 (feature-local clean architecture, `club` 패키지 유지):

- `AdminClubNotificationHealth`에 필드 추가:
  - `recentFailed7d: Int` — `FAILED+DEAD, updated_at >= now-7d` (목록 `notificationFailureCount` 정의와 동일).
  - `priorFailed7d: Int` — `FAILED+DEAD, now-14d <= updated_at < now-7d`.
- `AdminClubAiUsage`에 필드 추가:
  - `priorFailedJobs7d: Int` — `FAILED, now-14d <= created_at < now-7d`. (`failedRecentJobs`가 최근 7일 짝.)
- `notificationHealth(clubId)`의 `failureClusters`를 7일 윈도우(`updated_at >= now-7d`)로 좁혀 요약과 일관화. `failed`/`dead`(전체 기간)는 패널 표시용으로 유지.
- 새 컬럼은 모두 단일 클럽 scalar 집계로 추가(클럽 N+1 없음). 기존 인덱스(`notification_deliveries_club_status_idx`, `idx_aigen_audit_club`)가 윈도우 집계를 커버한다.
- `readiness`는 변경 없음(blocker 코드 유지).

프론트:

- `AdminClubOperationsSnapshot` 타입에 `notificationHealth.recentFailed7d`, `notificationHealth.priorFailed7d`, `aiUsage.priorFailedJobs7d` 추가.
- 순수 계산 헬퍼: `notificationFailureDelta = recentFailed7d - priorFailed7d`, `aiFailureDelta = failedRecentJobs - priorFailedJobs7d`. 모델 모듈에 둔다.
- blocker 코드 → 안전 라우트 매핑 헬퍼(모델 모듈):
  - `HOST_REQUIRED` → 호스트 표면(클럽 호스트 앱).
  - `DOMAIN_ACTION_REQUIRED` → 도메인 조치 라우트.
  - `CLUB_NOT_ACTIVE` → 안전 라우트(클럽 메타/상태).
- UI (`admin-club-operations-page.tsx`):
  - 요약 "알림 실패" metric을 `recentFailed7d`로 교체 + `↑/↓ N (지난 7일 대비)` 델타 한 줄.
  - AI 패널에 `failedRecentJobs`와 동일한 델타 표기.
  - `readiness.blockingReasons`의 각 blocker를 next-action **링크**로 렌더.
  - **플랫폼 소유**(readiness/메타/도메인) 섹션과 **호스트 소유**(세션 진행·멤버 활동) 섹션을 시각적으로 구분(섹션 헤더/그룹핑).
- E2E mock, 테스트 factory, fixture에 신규 필드 안전 기본값(0) 추가.

## 6. Non-goals

- 클럽 상세 스냅샷 전면 재설계나 새 라우트 추가.
- 일별 버킷 시계열/스파크라인(이 슬라이스는 최소 델타만; 시계열은 S8 소관).
- admin write 동작(cap/flag/kill-switch — S6+ 소관).
- 호스트 명령(세션 편집·출석·멤버 lifecycle·notes)을 `/admin`으로 이전.
- 실패 raw error/원인 메시지, transcript, provider 응답, 생성 결과 JSON, 멤버 사적 데이터 노출. 카운트·델타·safe error code만 노출.

## 7. Data Contract

| 필드 | 서버 model | 서버 response | 프론트 타입 | 의미 |
| --- | --- | --- | --- | --- |
| notificationHealth.recentFailed7d | `Int` | `Int` | `number` | 최근 7일 FAILED+DEAD 알림 배송 (목록과 동일 정의) |
| notificationHealth.priorFailed7d | `Int` | `Int` | `number` | 직전 7일(now-14d~now-7d) FAILED+DEAD 알림 배송 |
| aiUsage.priorFailedJobs7d | `Int` | `Int` | `number` | 직전 7일 FAILED AI 생성 audit |

`schema` 리터럴은 `admin.club_operations_snapshot.v1` 유지. 기존 필드 보존. 서버 DTO, 프론트 types, fixtures, E2E mock이 동일 필드명과 shape을 쓴다.

## 8. Permissions And Public Safety

- 권한 변화 없음. 기존 `/admin/clubs/:clubId` 상세와 동일 권한 매트릭스(OWNER/OPERATOR/SUPPORT read).
- 카운트·델타 정수와 safe error code만 노출. provider raw error, transcript body, 생성 결과 JSON, 멤버 데이터, 사적 메시지 body, secret을 UI/응답/fixture/docs/테스트에 넣지 않는다.
- next-action 링크는 기존 admin/host 라우트만 가리킨다. placeholder와 sanitized fixture만 사용한다.

## 9. Testing And Verification Gates

서버:

- `@Tag("integration")` 테스트가 FK 체인을 시딩해 윈도우 경계와 카운트 정확성을 검증한다:
  - `notification_deliveries`: FAILED/DEAD를 최근 7일·직전 7일(now-14d~now-7d)·7일 이전 각각 시딩 → `recentFailed7d`/`priorFailed7d` 정확성, 14일 이전 제외, PENDING/SENT 제외.
  - `ai_generation_audit_log`: FAILED를 최근 7일·직전 7일·그 이전 시딩 → `failedRecentJobs`/`priorFailedJobs7d` 정확성.
  - `failureClusters`가 7일 윈도우 밖 실패를 제외하는지.
- 경계(패키지/슬라이스) 이동이 생기면 `architectureTest`.
- `./server/gradlew -p server unitTest` + 해당 integration test.

프론트:

- model 단위테스트: `notificationFailureDelta`/`aiFailureDelta` 계산(양수/음수/0), blocker 코드 → 라우트 매핑(모든 알려진 코드 + unknown 안전 처리).
- route/UI 테스트: 요약 metric이 `recentFailed7d`를 렌더, 델타 한 줄 표기, 각 blocker가 next-action 링크를 가짐, 플랫폼/호스트 섹션 구분.
- 기존 클럽 상세 스냅샷 E2E 회귀.
- `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`.
- 라우트/유저플로 변경 시 `pnpm --dir front test:e2e`.

릴리즈:

- CHANGELOG `Unreleased`에 shipped 동작 기술.
- 공개 릴리즈 영향: 변경 파일 대상 public-safety scan.

## 10. Dependency

- 선행: S3+ 목록 완결(트리아지 + 실패 카운트, shipped). 이 슬라이스는 동일 7일 윈도우 정의를 상세에 재사용한다.
- 후속: 이 슬라이스가 S3+를 닫는다. 다음 슬라이스는 S4+ 지원 워크벤치 심화이며 자기 spec과 implementation plan을 갖는다. `recentFailed7d`/`priorFailed7d`/`priorFailedJobs7d` 계약은 S8 분석(알림 도달률·AI 실패 추세)이 재사용할 수 있으므로 안정적 필드명을 유지한다.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| 추가 윈도우 집계가 상세 쿼리 성능 저하 | 단일 클럽 scalar 집계, 기존 club_id/status/시간 인덱스 재사용, N+1 없음 |
| 목록·상세 윈도우 정의가 갈라짐 | 동일 7일 정의를 명시적으로 재사용, 계약 테스트로 고정 |
| 요약 metric 의미 변경(전체→7일)이 운영자 혼동 | 라벨에 "(7일)" 명시, 전체 기간 failed/dead는 패널에 유지 |
| blocker→라우트 매핑이 깨진 링크 생성 | 알려진 코드만 매핑, unknown은 링크 없이 안전 처리, 라우트 존재 테스트 |
| 신규 필드 누락 fixture로 테스트 깨짐 | 모든 fixture/mock/factory에 기본값 0 추가 |
| 공개 저장소 안전이 docs/예시로 회귀 | 변경 파일 대상 public-safety scan 실행 |

## 12. Next Step

이 spec이 리뷰된 뒤, 본 슬라이스의 implementation plan을 작성한다(writing-plans). plan은 이 문서 범위만 구현하고 S4+/S6+/S8로 확장하지 않는다. 이 슬라이스가 닫히면 S4+ 지원 워크벤치 심화가 다음 current 슬라이스가 된다.
