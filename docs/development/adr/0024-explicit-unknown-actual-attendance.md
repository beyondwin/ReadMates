# ADR-0024: 실제 출석에 명시적 `UNKNOWN` correction 상태 제공

- 상태: Proposed
- 결정일: 2026-08-22
- 작성자: 제품·서버·프런트엔드
- 관련: ADR-0021, `server/src/main/kotlin/com/readmates/session/adapter/in/web/AttendanceController.kt:17`

## 컨텍스트

현재 실제 출석 write는 `ATTENDED|ABSENT`만 허용한다. Host가 잘못 확정한 값을 다시 “확인 전”으로 되돌릴 수 없으면 미확인과 불참이 혼합되거나 임의의 거짓 값이 남는다.

## 결정

Actual attendance는 `ATTENDED|ABSENT|UNKNOWN`을 first-class correction state로 쓴다. `UNKNOWN`은 RSVP 미응답과 다르며, host가 아직 실제 출석을 확인하지 않았다는 뜻이다. 단일 row와 bulk correction 모두 audit actor/time을 남기며 bulk command는 전부 성공하거나 전부 rollback한다.

## 근거

- 불확실성을 거짓 확정값으로 대체하지 않는다.
- 오입력 correction과 출석 집계 분모를 명확히 한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| `ABSENT`를 미확인에도 사용 | 실제 불참과 확인 전을 구분할 수 없다. |
| 출석 row 삭제로 복원 | audit와 concurrency 의미가 모호하다. |

## 결과

긍정적:
- 실제 출석 correction이 가역적이다.

부정적/감수한 비용:
- API, persistence, 집계, UI filter migration이 필요하다.

## 검증

- 세 상태 전이, audit, single/bulk rollback, RSVP 비간섭을 server/UI test한다.

## 후속 작업

- 코드·migration·tests·active architecture가 일치하면 `Accepted`로 승격한다.
