# ADR-0049: 일정 revision 확인을 접속·참석 응답·실제 출석과 분리

- 상태: Accepted
- 결정일: 2026-09-01
- 작성자: product/server/front/privacy
- 관련: ADR-0018, ADR-0021, ADR-0023, ADR-0024, ADR-0025, ADR-0028, ADR-0048, `docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md`

> 이 ADR의 저장 모델, API/BFF/frontend 계약과 privacy 경계가 현재 구현 및 Stage 5 acceptance evidence와 일치해 `Accepted`로 승격했다. Production migration 시간과 rollout은 별도 미측정 운영 범위다.

## 컨텍스트

호스트는 일정 변경 후 누가 최신 일정을 확인했는지 알아야 하지만 최근 클럽 접속, 일정 열람, 참석 응답, 실제 출석은 서로 다른 사건이다. 최근 접속만으로 최신 일정 확인을 추정하면 변경 내용을 보지 않은 멤버를 확인 완료로 잘못 분류한다. 참석 응답이나 알림 전달 성공도 사용자가 최신 일정을 실제로 열었다는 증거가 아니다. 반대로 상세 페이지 이동을 모두 기록해 노출하면 필요한 운영 신호보다 감시 범위가 커진다.

## 결정

일정은 증가하는 `scheduleRevision`을 가지며, 멤버별로 마지막 확인한 `seenScheduleRevision`과 확인 시각을 저장한다. 호스트 조회는 다음 세 상태를 제공한다.

- `CURRENT`: `seenScheduleRevision == scheduleRevision`
- `STALE`: `seenScheduleRevision`이 존재하고 현재 revision보다 작음
- `UNSEEN`: 확인 revision이 없음

UI 라벨은 각각 `현재 일정 확인`, `변경 전 확인`, `미열람`이다. 최근 클럽 접속은 coarse `lastClubAccessAt` 사실로만 별도 표시하고, 참석 응답과 실제 출석은 ADR-0021/0024의 독립 사실을 유지한다. 알림 전달 receipt는 일정 확인으로 승격하지 않는다. 호스트에게는 상태, 마지막 확인 시각, 현재 revision 기준만 제공하며 페이지별 방문 이력이나 세부 행동 로그는 제공하지 않는다.

일정의 호스트·멤버 노출 필드가 바뀌는 mutation만 revision을 증가시킨다. 메모, 내부 처리 상태처럼 멤버가 볼 수 없는 변경은 일정 확인 상태를 무효화하지 않는다. 어떤 필드가 revision을 올리는지는 server domain policy와 테스트가 소유한다.

`seenScheduleRevision`과 `seenScheduleAt`은 해당 session-participant 기록과 같은 생애주기를 가진다. participant 또는 session이 hard delete/anonymize되면 일정 확인 사실도 함께 삭제하거나 익명화하고, 합법적으로 유지되는 participant 기록이 있는 동안에만 역사적 확인을 유지한다. membership가 `INACTIVE`가 된 뒤에는 seen/access 사실을 새로 기록하지 않는다.

`lastClubAccessAt`은 ACTIVE membership의 coarse club access에만 사용한다. membership가 `INACTIVE` 또는 삭제되면 club-access row를 제거한다. page path, action, duration, IP, user agent, auth-session timestamp는 저장하거나 추론하지 않는다.

미래 `DRAFT`는 host operating room의 선택 후보가 될 수 있지만, 멤버에게 공개된 current schedule과 participant snapshot이 없으면 확인 분모가 없다. 이때 host API는 unavailable 상태를 반환하고 `UNSEEN` 숫자, 일정 확인 write, `SCHEDULE_UNSEEN` work item을 만들지 않는다. 확인 write와 집계는 멤버에게 공개된 `OPEN` current schedule에서만 활성화한다.

## 근거

- 일정 변경 후 잘못된 장소·시간을 보는 위험을 직접 측정한다.
- 확인, 응답, 출석을 분리해 운영 지표가 서로를 대리하지 않게 한다.
- revision 비교는 단순 boolean read receipt보다 변경 후 재확인을 표현할 수 있다.
- 필요한 최소 사실만 제공해 호스트 운영성과 멤버 privacy를 함께 지킨다.
- 알림 전달과 사용자 확인을 분리해 provider 성공을 사람의 행동으로 오해하지 않는다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 마지막 접속이 일정 변경 이후면 확인으로 간주 | 접속했지만 일정을 열지 않은 경우를 구분하지 못한다. |
| 일정 확인 boolean 하나만 저장 | 일정 변경 후 이전 확인을 현재 확인과 구분할 수 없다. |
| 참석 응답을 일정 확인으로 간주 | 응답 후 일정이 바뀌는 경우와 응답 없는 열람을 모두 잘못 분류한다. |
| 알림 전달 성공을 확인으로 간주 | provider receipt는 콘텐츠 열람 증거가 아니다. |
| 페이지·행동 전체 추적 | 호스트에게 불필요한 감시 데이터를 만들고 privacy 경계를 넓힌다. |

## 결과

긍정적:

- 호스트가 최신 일정 확인 대상만 정확히 골라 안내할 수 있다.
- 변경 후 재확인 필요 상태가 명시된다.
- 참석 응답과 실제 출석 통계의 의미가 보존된다.
- 상세 행동 로그 없이 목적에 맞는 최소 read fact를 제공한다.

부정적/감수한 비용:

- 일정 변경 필드 분류와 revision 증가 정책을 domain에서 관리해야 한다.
- 멤버 확인 write의 idempotency, 동시성, offline/retry 처리가 필요하다.
- 기존 데이터는 확인 revision이 없으므로 migration 후 `UNSEEN` 또는 명시적 unknown backfill 정책이 필요하다.
- 집계와 멤버별 drill-down API, BFF contract, frontend cache invalidation이 추가된다.

## 검증

- 열람 write 시점, 같은 revision idempotency, RSVP와의 독립성은 [current-session route](../../../front/features/current-session/route/current-session-route.tsx)와 [route test](../../../front/features/current-session/route/current-session-route.test.tsx)가 고정한다.
- `UNSEEN → CURRENT → STALE → CURRENT`, DRAFT/INACTIVE/cross-club fail-closed, privacy projection은 [DB integration test](../../../server/src/test/kotlin/com/readmates/session/api/SessionScheduleSeenDbTest.kt)가 검증한다.
- server 응답과 frontend Zod schema의 동일성은 [contract test](../../../server/src/test/kotlin/com/readmates/contract/FrontendZodSchemaContractTest.kt), 사용자 흐름은 [schedule-seen E2E](../../../front/tests/e2e/schedule-seen-lifecycle.spec.ts)가 검증한다.
- V61–V65 순차 적용과 migration 불변식은 [MySQL Flyway migration test](../../../server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt) 및 [session invariant test](../../../server/src/test/kotlin/com/readmates/session/domain/SessionInvariantConstraintTest.kt)가 소유한다.
- Stage 1 전체 gate는 `.superpowers/sdd/2026-08-29-host-schedule-seen-stage1/stage1-gate-report.md` SHA-256 `f7c85e8a25052cfe6441d73b60cb8319dfc6ee72ac728ecc3fce910b10a7f36d`에 봉인되어 있다.
- Stage 5 acceptance는 V61–V65 clean/upgrade migration, schedule-seen policy·timing·privacy, parallel upsert와 role-loss cleanup, trusted BFF·authorization, 안정적인 Zod fixture digest, Chromium schedule lifecycle·cross-club·role evidence를 확인했다. Full server integration union은 1465/1465, server CI는 통과했다.

## 잔여 운영 검증

- 실제 production migration 시간과 rollout은 측정·실행하지 않았다. 배포 시 backend가 Flyway V61–V65를 먼저 적용한 뒤 compatible frontend를 배포하며, rollback은 compatible image 또는 더 높은 버전의 forward-fix로 수행한다.
