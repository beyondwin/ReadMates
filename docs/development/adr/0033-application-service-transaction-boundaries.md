# ADR-0033: Business orchestration owner가 transaction boundary를 소유

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 서버
- 관련: ADR-0002, `server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt:59`,
  `server/src/main/kotlin/com/readmates/notification/adapter/out/persistence/JdbcManualNotificationDispatchAdapter.kt:100`

## 컨텍스트

하나의 command가 여러 write port, audit, outbox, cache-after-commit을 조정할 때 transaction owner가 command의 atomic capability 경계와 어긋나면 business atomicity가 흩어진다. 현재 session lifecycle은 application service가 여러 port를 조정하지만, manual notification confirm처럼 하나의 outbound port가 내부 여러 SQL을 단일 atomic persistence capability로 제공하는 경로도 있다.

## 결정

Transaction boundary는 business orchestration owner가 소유한다. Application service가 여러 port를 조정하면 service method가 boundary를 소유한다(`HostSessionLifecycleService.kt:59-81`). 하나의 outbound port가 여러 SQL을 외부에 노출하지 않는 단일 atomic persistence capability로 제공하면 그 adapter가 boundary를 소유할 수 있다(`JdbcManualNotificationDispatchAdapter.kt:100-104`). Scheduler/listener처럼 service transaction을 거치지 않는 inbound path의 adapter boundary도 허용한다. Controller는 HTTP parsing과 use-case 호출만 담당한다. Isolation level은 claim 또는 read-modify-write가 기본 격리보다 강한 보장을 요구할 때만 명시한다.

## 근거

- Business atomicity와 clean-architecture dependency direction이 일치한다.
- Cache invalidation과 event 기록을 commit 이후에 연결할 수 있다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| Controller가 transaction 소유 | Transport layer에 business atomicity가 결합된다. |
| 모든 adapter transaction 금지 | Atomic persistence port 내부 SQL까지 service에 누출한다. |

## 결과

긍정적:
- Orchestration/port capability 단위 transaction과 rollback 의미가 명확하다.

부정적/감수한 비용:
- 중첩 annotation과 external I/O 위치를 지속적으로 review해야 한다.

## 검증

- Application service의 multi-port rollback과 atomic persistence port의 내부 rollback을 각각 integration test하고 ArchUnit 경계를 유지한다.
- Server canonical gate는 `./scripts/server-ci-check.sh`다.

## 후속 작업

- Service와 adapter가 같은 atomic work를 중복 소유하는 boundary는 tests로 owner를 정한 뒤 좁은 cleanup으로 제거한다.
