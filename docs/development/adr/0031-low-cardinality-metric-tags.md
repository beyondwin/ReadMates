# ADR-0031: Notification 운영 metric tag를 low-cardinality 값으로 제한

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 서버·운영
- 관련: `server/src/main/kotlin/com/readmates/notification/application/service/ReadmatesOperationalMetrics.kt:39`

## 컨텍스트

Prometheus는 tag 조합마다 time series를 만든다. Notification metric에서 club, user, membership, recipient, event, delivery, session 같은 row-level ID를 tag로 쓰면 데이터 증가에 따라 cardinality가 무한히 커진다. 현재 `ReadmatesOperationalMetrics` KDoc가 이 범위를 명시적으로 강제한다.

## 결정

`ReadmatesOperationalMetrics`가 등록하는 notification metric tag에는 enum과 bounded low-cardinality 상태만 사용한다. Row-level identifier와 개인정보는 tag에 넣지 않는다(`ReadmatesOperationalMetrics.kt:39-49`). 개별 notification 사건 조회는 audit table 또는 privacy-safe structured log를 사용한다. 다른 metric family 전체가 이 ADR로 이미 allowlist 강제된다고 주장하지 않는다.

## 근거

- Storage, scrape, query 비용을 데이터 행 수와 분리한다.
- 개인정보성 identifier의 metric 유출을 막는다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 모든 ID를 tag로 제공 | Time series 폭증과 privacy 위험을 만든다. |
| 운영 metric을 없앰 | Aggregate health와 alerting을 잃는다. |

## 결과

긍정적:
- Notification metric cardinality가 bounded vocabulary에 의해 제한된다.

부정적/감수한 비용:
- 특정 사건 조사는 별도 audit query가 필요하다.

## 검증

- Notification metric registration test와 `ReadmatesOperationalMetrics` source scan으로 금지 tag key/value를 검사한다.

## 후속 작업

- 새 notification metric은 tag vocabulary와 예상 cardinality를 review한다.
- 모든 metric family의 global fixed-vocabulary enforcement는 실제 ingress allowlist와 tests를 갖춘 뒤 별도 ADR로 결정한다.
