# ADR-0049: 일정 revision 확인을 접속·참석 응답·실제 출석과 분리

- 상태: Proposed
- 결정일: 2026-08-29
- 작성자: product/server/front/privacy
- 관련: ADR-0018, ADR-0021, ADR-0023, ADR-0024, ADR-0025, ADR-0028, ADR-0048, `docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md`

> 이 ADR은 승인된 product semantics다. 저장 모델, API, BFF, frontend와 privacy 검증이 아직 일치하지 않으므로 구현 전까지 `Proposed`다.

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

- 최초 열람, 같은 revision 재열람, revision 증가 후 `STALE`, 최신 revision 재열람 후 `CURRENT`를 검증한다.
- 참석 응답 변경, 실제 출석 기록, 알림 전달, host-only 필드 변경이 seen state를 바꾸지 않음을 검증한다.
- 멤버 노출 일정 필드 변경만 revision을 증가시키는 allowlist/denylist 테스트를 둔다.
- 다른 클럽·다른 모임의 revision이 섞이지 않는 authorization/club-context 테스트를 둔다.
- 동시 일정 변경과 확인 write에서 revision guard와 idempotency가 잘못된 `CURRENT`를 만들지 않음을 검증한다.
- DRAFT unavailable → OPEN UNSEEN → CURRENT → 일정 변경 STALE → CURRENT 전이를 검증한다.
- membership INACTIVE/delete와 participant/session hard-delete/anonymize에서 access/seen lifecycle과 erase behavior를 migration/integration test로 검증한다.
- API/BFF 응답에 이메일, 계정 ID, 상세 page history 같은 불필요한 개인정보가 포함되지 않는 forbidden-key 테스트를 둔다.
- server focused test, migration integration, frontend model/route test, 영향 E2E와 active docs가 일치할 때만 `Accepted`로 승격한다.

## 후속 작업

- migration/backfill 정책과 retention 기간을 구현 계획에서 확정.
- 멤버 앱의 확인 write 시점과 offline retry UX를 별도 task로 구현.
- 호스트 대상 선택 화면에서 CURRENT/STALE/UNSEEN 필터와 제외 사유를 제공.
