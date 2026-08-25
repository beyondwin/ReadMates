# ADR-0038: Host 모임·기록 목록을 server-owned cursor epoch로 제공

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 서버·프런트엔드·제품
- 관련: ADR-0009, ADR-0022, ADR-0033,
  `server/src/main/kotlin/com/readmates/session/adapter/out/persistence/HostSessionQueries.kt`

## 컨텍스트

호스트 `모임` 목록은 `DRAFT|OPEN`, `기록` 목록은 `CLOSED|PUBLISHED`를 하나의 pagination stream으로 보여 줘야 한다. 현재 API의 단일 `state` cursor를 browser에서 두 번 호출해 합치면 각 cursor의 위치와 전체 순서를 증명할 수 없다. 또한 attention, 날짜, lifecycle, record readiness는 바뀔 수 있으므로 mutable tuple만 사용하는 keyset cursor는 페이지 사이 변경에서 row를 조용히 누락하거나 중복할 수 있다.

## 결정

Server는 `mode=meeting|record` 두 canonical list mode를 제공한다. `meeting`은 `{DRAFT,OPEN}`, `record`는 `{CLOSED,PUBLISHED}` 한 SQL predicate와 한 cursor stream을 소유한다. `state`, repeated `states`, `mode` 동시 사용은 거절하고 state set, search, filter를 canonicalize한 뒤 cursor fingerprint에 넣는다. Browser는 cursor를 opaque value로 취급하고 per-state page를 병합하거나 cross-page reorder하지 않는다.

Meeting order는 `(attentionRank ASC, meetingDate ASC NULLS LAST, stateRank OPEN=0/DRAFT=1, sessionNumber DESC, sessionId DESC)`, record order는 `(attentionRank ASC, meetingDate DESC NULLS LAST, stateRank CLOSED=0/PUBLISHED=1, sessionNumber DESC, sessionId DESC)`다. Cursor는 ordering version, club UUID, canonical mode/state set, normalized query/filter fingerprint, server-issued fixed `evaluatedAt`, matching list epoch, expiry, key version과 마지막 tuple을 포함한다.

Cursor canonical payload는 request-identity key와 분리된 cursor 전용 key로 purpose-separated HMAC-SHA-256 서명하고 constant-time으로 검증한다. Current/previous key version을 명시하며 previous key는 24시간 cursor TTL과 rollout buffer 안에서만 replay한다. 한 필드/MAC 변조, unknown/retired key, expiry는 fail closed한다.

`club_host_list_epochs`는 meeting/record epoch를 별도로 소유한다. List membership, sort/filter/attention input을 바꾸는 application-service transaction은 neutral `shared/listing` port로 해당 epoch를 함께 올린다. Cursor epoch가 현재와 다르면 server는 page를 반환하지 않고 `LIST_CURSOR_STALE`와 canonical restart target을 반환한다. Epoch read/check, evaluatedAt, page SQL, next cursor는 하나의 MySQL `REPEATABLE_READ` consistent-snapshot transaction 안에 있어 concurrent row+epoch commit을 섞어 읽지 않는다. 따라서 no-gap/no-duplicate 보장은 epoch가 같은 continuation에만 적용하고, concurrent reorder를 snapshot처럼 가장하지 않는다.

## 근거

- Browser cursor merge 없이 lifecycle ownership을 분리한다.
- Admin에게 유용한 attention/date 정렬을 유지하면서 concurrent mutation을 정직하게 처리한다.
- Query fingerprint와 epoch가 cross-club, stale-filter, mutable-order replay를 막는다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| Browser가 DRAFT/OPEN 또는 CLOSED/PUBLISHED cursor를 병합 | 전체 순서와 다음 cursor의 완전성을 증명할 수 없다. |
| Mutable tuple만으로 계속 pagination | 이미 본 row 이동은 중복, 아직 안 본 row 이동은 누락을 만든다. |
| `sessionNumber + sessionId`만 정렬 | 안정적이지만 호스트가 먼저 처리할 attention/date 판단을 잃는다. |
| 요청마다 materialized snapshot 저장 | Snapshot storage/retention 비용이 현재 목록 요구보다 크다. |

## 결과

긍정적:
- 모임/기록 목록이 각각 하나의 authoritative cursor contract를 갖는다.
- 목록 변경 시 UI가 조용한 누락 대신 명시적으로 갱신·focus 복구한다.

부정적/감수한 비용:
- 모든 sort/filter input mutation의 epoch bump inventory가 필요하다.
- 페이지 도중 목록이 바뀌면 사용자는 canonical first page에서 다시 시작한다.

## 검증

- 두 mode의 허용 lifecycle, canonical fingerprint, exact tuple order와 lexicographic predicate를 DB integration test한다.
- 동일 epoch에서 equal-key tie, page no-gap/no-duplicate를 검증한다.
- Cursor 단일 필드/MAC 변조, unknown/retired key, expiry, valid previous-key rollout replay와 constant-time/no-log 경계를 검증한다.
- Epoch read와 page SQL 사이 mutation을 latch로 commit해 complete old snapshot 또는 zero-data stale만 관찰되는지 검증한다.
- 모든 registered input을 페이지 사이 변경해 `LIST_CURSOR_STALE`, zero partial page, frontend clear/replace/announcement/focus를 검증한다.
- Executable coverage test가 SQL sort/filter source와 epoch-bump mutation owner의 누락을 실패시킨다.

## 후속 작업

- Server query, mutation inventory, frontend route/model, E2E, active architecture가 일치하면 `Accepted`로 승격한다.
