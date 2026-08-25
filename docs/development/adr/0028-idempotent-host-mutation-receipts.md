# ADR-0028: Host mutation을 idempotency receipt로 재조정

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 서버·프런트엔드·제품
- 관련: ADR-0015, ADR-0023, `server/src/main/kotlin/com/readmates/notification/application/port/out/ManualNotificationDispatchPort.kt:91`

## 컨텍스트

Server commit 뒤 response가 끊기면 create, publish, restore, notification confirm을 맹목적으로 재시도할 때 중복 side effect가 생길 수 있다. Notification confirm은 이미 content revision, target snapshot, duplicate/resend 경계를 사용하지만 다른 host mutation에는 공통 reconciliation 계약이 없다.

## 결정

Receipt-bearing host mutation은 `(club, actor membership, operation, resource/create slot, key)` 범위 idempotency key를 사용한다. Server는 DTO validation/default 이후 operation별 versioned canonical schema를 적용하고, Unicode NFC, field order, collection/set order, null/omitted/default 의미를 schema version에 고정한다. Raw canonical payload나 평문 SHA digest는 저장하지 않고 server secret-keyed HMAC digest, canonical schema version, digest key version만 저장한다. Meeting URL/passcode 같은 낮은 entropy 민감 입력도 log/receipt에 남기지 않는다. 이전 digest key는 해당 key version을 참조하는 idempotency row가 모두 purge되고 추가 24시간 rollout buffer가 지난 뒤에만 폐기한다. Reference count가 unavailable이거나 purge가 지연되면 retirement를 fail closed한다.

기존 host `mutation_idempotency_keys`처럼 raw idempotency key를 stable unique identity로 저장하는 protocol은 key rotation에도 같은 ownership row를 찾는다. 반대로 privacy 때문에 raw key를 저장하지 않고 idempotency-key HMAC으로 index하는 protocol(예: platform-admin safe command)은 하나의 logical claim에 key version별 alias를 둬야 한다. Overlap window에서는 current와 previous key alias를 모두 계산해 정렬된 순서로 예약하므로 어느 version으로 재시도해도 같은 claim/receipt로 수렴한다. 단일 current-version fingerprint만 unique하게 두어 rotation 순간 두 claim을 허용하는 설계는 사용하지 않는다. 이전 digest key는 그 version의 alias가 모두 purge되고 `unreferenced_since` 이후 최소 24시간 rollout buffer가 지난 뒤에만 폐기한다. Reference 확인이 불가능하거나 purge가 지연되면 retirement를 fail closed한다.

같은 key·같은 HMAC request identity는 같은 immutable receipt를, 같은 key·다른 request는 conflict를 반환한다. Response loss에서는 authoritative state와 receipt를 조회한 뒤 미실행이 확인될 때만 같은 key로 재시도한다. Receipt lookup은 현재 host authority를 다시 확인한다. Notification의 더 강한 preview/duplicate/resend 계약은 약화하지 않는다.

Operational idempotency ownership row는 bounded retention으로 제거할 수 있다. Immutable feature receipt는 삭제 가능한 session/publication row에 destructive FK를 두지 않고 redacted resource UUID snapshot을 보존한다. 따라서 기존 7일 hard delete는 계속 성공하며 receipt bytes는 authorized reconciliation/audit 경로에서만 노출된다.

## 근거

- Timeout 뒤 중복 create·dispatch·publish를 막는다.
- UI가 `실패`와 `결과 확인 중`을 구분할 수 있다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 모든 timeout에 새 request로 재시도 | commit 여부가 불명확하면 side effect가 중복된다. |
| frontend memory만으로 key 유지 | reload와 multi-tab에서 authoritative receipt가 없다. |

## 결과

긍정적:
- Mutation 결과, audit, retry가 하나의 조회 가능한 계약을 갖는다.

부정적/감수한 비용:
- Receipt persistence, bounded idempotency retention, purge와 privacy test가 필요하다.

## 검증

- Canonicalization field/null/default/Unicode/collection matrix와 HMAC key rotation replay를 test한다. Raw key를 저장하지 않는 protocol은 overlapping key version별 alias가 같은 claim으로 수렴하고, 참조 alias가 남거나 24시간 retirement buffer가 지나지 않으면 key 폐기를 거절하는지도 test한다.
- Duplicate, same-key/different-payload, response loss, authority revoked lookup과 raw sensitive payload 비저장을 integration test한다.
- 만료된 synthetic resource hard delete 후 operational row retention과 redacted immutable receipt 보존을 integration test한다.

## 후속 작업

- 코드·migration·tests·active architecture가 일치하면 `Accepted`로 승격한다.
