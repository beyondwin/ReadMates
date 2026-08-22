# ADR-0032: Client IP hash salt를 ISO 주 단위로 회전

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 서버·보안
- 관련: `server/src/main/kotlin/com/readmates/shared/security/ClientIpHashing.kt:7`

## 컨텍스트

Rate limit과 운영 관측에는 raw IP를 저장하지 않는 안정적 단기 식별자가 필요하다. 영구 salt는 같은 IP를 장기간 연결할 수 있게 한다.

## 결정

Client IP hash는 base secret과 ISO week-based year/week로 salt를 만들고 SHA-256 결과를 축약한다(`ClientIpHashing.kt:22-26`). Production-like 환경은 non-blank base secret을 요구한다. 이 회전은 client IP용이며 token/session의 별도 stable hash 의미를 바꾸지 않는다.

## 근거

- 단기 rate-limit grouping을 유지하면서 cross-week linkability를 줄인다.
- Raw IP를 persistence/metric에 넣지 않는다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 영구 salt 사용 | 장기간 동일 IP 연결이 가능하다. |
| 요청마다 random salt | Rate limit grouping을 할 수 없다. |

## 결과

긍정적:
- IP pseudonym의 장기 연결 가능성이 주 경계에서 끊긴다.

부정적/감수한 비용:
- 주 경계에서 IP 기반 bucket이 reset된다.

## 검증

- 같은 주 안정성, 주 경계 회전, blank-secret policy를 `ClientIpHashing` test로 확인한다.

## 후속 작업

- Retention 또는 threat model이 바뀌면 회전 주기를 별도 ADR로 재결정한다.
