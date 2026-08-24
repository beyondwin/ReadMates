# ADR-0037: 긴급 public takedown을 platform-admin 전용 command로 실행

- 상태: Proposed
- 결정일: 2026-08-22
- 작성자: 플랫폼 운영·보안·서버
- 관련: ADR-0028, ADR-0036, `docs/development/architecture.md:113`

## 컨텍스트

민감 정보가 public projection에 잘못 게시되면 origin deny, generation 회전, CDN purge를 빠르게 시작해야 한다. 이 action은 대상 club의 host membership이 없는 platform admin도 수행할 수 있으므로 host mutation의 `(actorMembershipId, ...)` idempotency/authorization 계약을 재사용할 수 없다. Provider response loss 뒤 purge를 반복하면 결과와 audit도 모호해진다.

## 결정

Emergency public takedown은 별도 `PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN` preview/confirm command다. 이 capability는 active platform-admin OWNER/OPERATOR에만 매핑하며 application service는 raw role 비교가 아니라 `actor.can(...)`으로 검사한다. `SUPPORT`, inactive admin, capability가 제거된 OPERATOR actor, 대상 club/session/publication mismatch는 fail closed한다. Preview는 target identity와 current public generation/surfaces, TTL, remote-copy limitation을 고정하고 confirm에서 모두 재검증한다. Confirm reason category는 `PRIVATE_DATA|LEGAL_REQUEST|SECURITY_INCIDENT|PUBLIC_SAFETY`의 고정 enum만 허용하고 bounded reason 원문은 HMAC request identity에만 결합한다. Confirm 활성화 전에는 ADR-0036의 기존 720초 browser cache lifetime 소진 증거가 필요하다.

Idempotency scope는 `(platformAdminUserId, EMERGENCY_PUBLIC_TAKEDOWN, clubId, publicationId, idempotencyKey)`다. Versioned canonical request HMAC은 ADR-0028의 민감 입력 규칙을 따른다. Duplicate claim은 MySQL repeatable-read snapshot을 재사용하지 않고 locking current read로 completed row와 receipt를 다시 읽는다. 같은 key/request 경쟁은 승자의 receipt에 수렴하고 같은 key/different request는 conflict다. Origin deny와 generation commit은 immutable admin mutation receipt를 한 번만 만들고 `convergenceId`를 반환한다. CDN purge는 ADR-0036의 append-only convergence attempt ledger에 기록한다. Response loss 또는 failed purge 재개는 같은 receipt/convergence ID를 조회·재사용하며 새로운 mutation receipt나 중복 purge command를 만들지 않는다.

Immutable admin audit은 actor ID/role, reason category와 redacted reason, target identity의 UUID snapshot, origin result, generation, convergence ID를 기록한다. 삭제 가능한 publication/session content에 destructive FK를 두지 않으며 raw private content나 provider error 원문은 저장하지 않는다.

## 근거

- Host membership과 platform authority를 혼합하지 않는다.
- 보안 사고 command의 확인·중복 실행·response loss를 재현할 수 있다.
- Immutable mutation audit와 반복 가능한 provider convergence를 분리한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| Host mutation receipt를 재사용 | Platform admin에게 대상 club membership이 없을 수 있다. |
| Purge 실패 때 새 command 생성 | 동일 사고의 origin mutation과 provider retry가 중복된다. |
| SUPPORT도 실행 허용 | Read-only support capability를 넘어선다. |

## 결과

긍정적:
- 긴급 철회의 actor, target, DB 결과, provider convergence를 독립적으로 감사할 수 있다.

부정적/감수한 비용:
- Admin preview/confirm persistence, HMAC key rotation, purge provider adapter와 runbook이 필요하다.

## 검증

- capability가 있는 active `OWNER|OPERATOR` 성공, 같은 role이지만 capability가 없는 actor와 `SUPPORT`·inactive·target mismatch 거절을 authorization test한다.
- Duplicate/same-key-different-request/response-loss/purge-failure-resume가 mutation receipt 하나와 append-only attempt를 만드는지 integration test한다.
- Admin DTO, audit, logs, evidence artifact에 raw reason/private content/provider error가 없는지 검사한다.
- 각 retention pass는 admin idempotency, takedown preview, host idempotency에 독립적으로 공정한 budget을 배분하고 전체 batch limit과 실제 삭제 count 계약을 보존한다.
- 2026-08-24 server substrate는 V55 preview/idempotency/immutable receipt, capability-only application authorization, origin deny와 generation 회전의 단일 transaction, V54 convergence link/work 재사용, redacted platform audit를 구현했다. Concurrent duplicate locking read, fixed reason-category allowlist, namespace-fair retention과 실제 trash scheduler hard-delete 회귀를 포함한다. Production activation adapter는 조건 없이 confirm을 거절하고 test context만 typed mock으로 성공 경로를 검증한다. Protected Step 8 attestation verifier, active incident runbook, operator UI, 실제 CDN runtime evidence는 아직 없으므로 이 ADR은 `Proposed`를 유지한다.

## 후속 작업

- Code, migration, tests, incident runbook, active architecture가 일치하면 `Accepted`로 승격한다.
