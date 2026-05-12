# ADR-0015: Notification Outbox dedupeKey 정책

- 상태: Accepted
- 결정일: 2026-05-12
- 작성자: server
- 관련: ADR-0004 (Transactional outbox + Kafka relay),
  `server/src/main/kotlin/com/readmates/notification/application/service/NotificationEventService.kt`,
  `server/src/main/resources/db/migration/V16__notification_outbox_dedupe_key_uk.sql`

## 컨텍스트

`NotificationEventService`의 각 enqueue 메서드는 `dedupeKey`를 직접 생성한다
(`server/src/main/kotlin/com/readmates/notification/application/service/NotificationEventService.kt:35/55/77`).
이 규칙이 코드와 함께 흩어져 있어 새 이벤트 유형 추가 시 dedupeKey 정책이 일관되지 않을 위험이 있다.
ADR-0004에서 정의한 `notification_outbox` 테이블은 V16 migration에서
`notification_outbox_dedupe_key_uk` unique constraint를 통해 중복을 DB 레이어에서 차단한다.
이 constraint가 어떤 키 구성을 전제하는지 코드와 ADR 어느 곳에도 명시되어 있지 않았다.

## 결정

세 가지 이벤트 유형의 dedupeKey 구성 규칙을 다음 표로 고정한다.
새 이벤트 정의 시 이 표를 보강하는 것을 PR 머지 조건으로 삼는다.

| event_type | dedupeKey 구성 | 이유 | 예시 |
| --- | --- | --- | --- |
| feedback-document | `feedback-document:$sessionId:$documentVersion` | 같은 버전 재발행 방지. 새 버전은 다시 발송 가능 | `feedback-document:00...0301:v3` |
| next-book | `next-book:$sessionId` | 세션당 한 번. 같은 책을 두 번 announce하지 않음 | `next-book:00...0301` |
| review-published | `review-published:$sessionId:$authorMembershipId` | 작성자별 한 번. 같은 작성자가 다시 publish해도 한 번만 | `review-published:00...0301:00...0101` |

키 구성 형식: `<event-type-slug>:<UUID segment(s)>`. 구분자는 `:`.

## 근거

1. **단일 진실 원천**: 키 규칙이 코드(KDoc) + ADR 두 군데에 동시에 존재하므로 신규 기여자가
   어느 한 곳만 봐도 정책을 파악할 수 있다.
2. **DB constraint 연동**: V16 migration의 `notification_outbox_dedupe_key_uk`는
   키 구성 규칙이 올바를 때만 중복을 정확히 차단한다.
   키 정책과 constraint가 같이 문서화되어 drift를 감지하기 쉬워진다.
3. **확장 비용 최소화**: 새 이벤트 추가 시 ADR 표 보강 + KDoc 추가만으로
   정책 전파가 완결된다. 별도 configuration 파일·enum 열거 불필요.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| A — dedupeKey를 enum/sealed class로 코드화 | 문서화 비용 < 코드 변경 비용. 이벤트 종류가 많지 않아 over-engineering. |
| B — dedupeKey 생성 로직을 별도 factory로 분리 | 현재 세 메서드는 단순 문자열 보간이어서 추상화 이득이 없음. |
| **C — ADR + KDoc로 정책 고정 (채택)** | 런타임 변경 없이 정책 가시성 확보. 신규 이벤트 추가 시 PR 리뷰에서 누락 차단 가능. |

## 결과

긍정적:
- dedupeKey 구성 규칙이 ADR 표와 각 메서드 KDoc에 동시에 문서화 → 신규 이벤트 추가 시 일관성 유지.
- V16 migration의 `notification_outbox_dedupe_key_uk` constraint가 전제하는 키 구성이
  ADR에 명시되어 운영 중 constraint violation 원인 분석이 쉬워짐.
- 코드 동작 회귀 없음 — KDoc 추가만이므로 컴파일 결과 동일.

부정적/감수한 비용:
- ADR 표와 코드가 별개로 존재하므로 규칙 변경 시 두 곳을 같이 수정해야 한다.
  이는 PR 리뷰 체크리스트로 관리한다.
- 새 이벤트 유형의 dedupeKey 고유성(uniqueness guarantee)은 여전히 작성자의 책임이다.
  ADR이 *규칙의 형식*을 고정할 뿐, 비즈니스 고유성 요건 자체를 검증하지는 않는다.

## 검증

V16 migration 파일(`notification_outbox_dedupe_key_uk`)이 존재하고
세 이벤트 유형의 dedupeKey가 위 표의 형식과 일치하는지:

```bash
# KDoc과 실제 dedupeKey 구성이 일치하는지 grep으로 확인
grep -n 'dedupeKey' \
  server/src/main/kotlin/com/readmates/notification/application/service/NotificationEventService.kt
```

컴파일 회귀 없음:

```bash
./server/gradlew -p server compileKotlin
```

## 후속 작업

- 새 이벤트 유형이 추가될 때 이 ADR 표에 행을 보강한다(PR 머지 조건).
- dedupeKey 고유성 요건이 변경되면(예: 동일 버전 재발행 허용) 이 ADR을 Supersede하고
  V16 constraint 변경 migration을 함께 제출한다.
