# ADR-0021: 참석 응답과 실제 출석을 별도 사실로 유지

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 제품·서버·프런트엔드
- 관련: `server/src/main/kotlin/com/readmates/session/application/SessionApplicationModels.kt:50`,
  `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionRowMappers.kt:91`,
  `server/src/main/kotlin/com/readmates/session/adapter/in/web/AttendanceController.kt:17`

## 컨텍스트

참석 의향과 실제 참여는 시간과 행위자가 다른 사실이다. 현재 application model과 row mapper도 `rsvpStatus`, `attendanceStatus`, `participationStatus`를 분리한다(`SessionApplicationModels.kt:50-52`, `HostSessionRowMappers.kt:91-93`). 그러나 운영 UI가 참석 응답 목록을 실제 출석처럼 보이게 하거나 둘을 한 상태로 덮으면 통계, 알림 대상, 기록 근거가 틀어진다.

## 결정

참석 응답은 멤버가 모임 전 입력하는 의향, 실제 출석은 host가 모임 뒤 확인하는 결과로 별도 저장·표시한다. 한 값이 다른 값을 자동 확정하지 않는다. RSVP는 actual attendance의 참고 정보일 뿐이며 actual attendance correction은 독립 audit를 남긴다.

## 근거

- “참석한다고 응답했지만 오지 않음”, “미응답이지만 참석함”을 정확히 보존한다.
- 알림 대상, 실제 출석 통계, 기록 evidence가 서로 다른 source를 사용할 수 있다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| RSVP를 실제 출석으로 복사 | 실제 상황이 바뀌는 정상 사례에서 거짓 데이터가 된다. |
| 실제 출석만 저장 | 사전 준비·미응답 알림 판단을 잃는다. |
| 하나의 상태 enum에 시점별 값을 혼합 | 누가 언제 어떤 사실을 입력했는지 audit가 불가능하다. |

## 결과

긍정적:
- 사전 준비와 사후 기록의 의미가 명확하다.
- 두 사실의 correction history를 독립적으로 추적할 수 있다.

부정적/감수한 비용:
- UI가 두 상태를 동시에 설명하고 서로 다른 filter/summary를 제공해야 한다.

## 검증

- RSVP와 actual attendance의 모든 조합이 서로 덮어쓰지 않는지 server test한다.
- 한 사실의 correction이 다른 사실의 audit 값을 바꾸지 않는지 검증한다.

## 후속 작업

- 실제 출석 `UNKNOWN` correction은 ADR-0024, response denominator snapshot은 ADR-0025를 따른다.
- canonical 사용자 copy migration은 ADR-0018을 따른다.
