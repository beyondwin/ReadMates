# ADR-0012: Redis를 선택적 보조 상태로 제한

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 서버·운영
- 관련: `docs/development/architecture.md:297`, ADR-0007

## 컨텍스트

ReadMates는 Redis adapter를 rate limit, read-through cache, invalidation, AI generation handoff에 사용하지만 MySQL이 session, membership, publication, notes의 source of truth다(`architecture.md:297-312`). Redis 장애나 유실이 핵심 데이터 손실로 이어져서는 안 된다.

## 결정

Redis는 기본 비활성화한 선택 계층으로 유지한다. 켜더라도 재생성 가능한 cache/counter 또는 짧은 TTL의 workflow state만 둔다. 핵심 도메인 데이터와 호스트가 commit한 검토 완료 snapshot은 MySQL에 저장한다. Redis cache 장애는 MySQL fallback으로 처리하고, AI generation처럼 Redis가 command authority인 미완료 workflow는 provider 호출 또는 commit 전에 fail closed한다.

## 근거

- 보조 인프라 장애가 핵심 데이터 손실로 확장되지 않는다.
- 비용과 운영 복잡도를 feature별로 선택할 수 있다.
- TTL, CAS, cleanup 경계를 workflow별로 명시할 수 있다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| Redis를 모든 session의 source of truth로 사용 | MySQL과 이중 권위를 만들고 장애 시 데이터 경계를 복잡하게 한다. |
| Redis를 전혀 사용하지 않음 | 짧은 TTL workflow와 cache의 운영상 이점을 포기한다. |

## 결과

긍정적:
- Redis가 꺼져도 핵심 읽기·쓰기가 유지된다.

부정적/감수한 비용:
- 기능별 fallback, invalidation, TTL cleanup test가 필요하다.

## 검증

- Redis disabled/available/unavailable 조합과 MySQL fallback을 targeted adapter test로 확인한다.
- Redis key와 metric label에 민감 원문이 없는지 public-safety scan한다.

## 후속 작업

- Redis를 필수 source of truth로 바꾸려면 이 ADR을 supersede한다.
