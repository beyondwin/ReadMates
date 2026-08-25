# ADR-0023: Domain revision으로 host mutation을 조건부 실행

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 서버·프런트엔드·제품
- 관련: ADR-0002, ADR-0009, ADR-0022,
  `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionDraftWriteOperations.kt:37`,
  `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionAttendanceWriteOperations.kt:19`,
  `docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`

## 컨텍스트

현재 basic update와 attendance batch update는 expected revision 없이 조건 없는 write를 수행한다(`HostSessionDraftWriteOperations.kt:37-44`, `HostSessionAttendanceWriteOperations.kt:19-56`). 공동 host 편집은 마지막 write가 조용히 이길 수 있고, close와 member write가 경합하면 snapshot 경계도 모호해질 수 있다.

## 결정

Host mutation은 변경 대상이 소유한 expected domain revision 또는 action-specific version vector를 검증하는 conditional transaction으로 실행한다. Conditional write가 0건이면 stale/conflict로 실패하고 partial commit하지 않는다. Domain별 revision은 서로 무관한 participant 변경의 false conflict를 피하되, publish처럼 여러 projection을 바꾸는 action은 필요한 vector 전체를 한 transaction에서 검증한다. 최초 public placement의 `publicationRevision`은 public content row 존재 여부와 분리된 최소 `session_publication_versions` row가 소유한다. 비어 있는 public summary나 가짜 publication shell을 만들지 않아 기존 publish-pending, DTO, hard-delete 의미를 보존한다. Close 대 member write는 server transaction barrier로 직렬화해 close 전 commit은 snapshot에 포함하고 close 후 write는 lifecycle conflict로 거절한다.

## 근거

- silent co-host overwrite와 stale public commit을 막는다.
- domain별 독립 revision으로 unrelated participant update의 false conflict를 줄인다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| last-write-wins 유지 | host가 다른 host의 변경을 조용히 덮어쓴다. |
| frontend timestamp 비교만 사용 | authoritative race를 막지 못하고 clock 의미도 불명확하다. |
| 모든 모임을 하나의 global revision으로 잠금 | unrelated attendance row까지 불필요하게 conflict한다. |

## 결과

긍정적:
- Conflict UI와 server conditional transaction의 계약이 연결된다.
- 공개 효과가 있는 노출/수정본 변경을 atomic하게 검증할 수 있다.

부정적/감수한 비용:
- revision persistence와 contract v3 rollout이 필요하다.
- concurrency integration test가 늘어난다.

## 검증

- same-base concurrent update 중 하나만 성공하고 winner가 보존되는지 확인한다.
- same/different participant concurrency, close 대 member-write race를 DB integration test한다.
- record/exposure/publication version vector stale 시 member/guest/public 표면이 하나의 old revision에 남는지 확인한다.

## 후속 작업

- ADR-0028이 idempotency, receipt, response-loss reconciliation을 별도로 결정한다.
- 구현 계획에서 revision domain과 v3 rollout task를 분리한다.
- 코드·migration·tests·active architecture가 conditional mutation을 강제하면 `Accepted`로 승격한다.
