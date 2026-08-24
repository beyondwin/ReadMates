# ADR-0040: 플랫폼 어드민 mutation을 도메인 소유 safe-command protocol로 실행

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 플랫폼 운영·보안·서버
- 관련: ADR-0001, ADR-0009, ADR-0012, ADR-0028, ADR-0029, ADR-0030, ADR-0033, ADR-0037, ADR-0039,
  ADR-0041, ADR-0042, ADR-0043,
  `docs/superpowers/specs/2026-08-22-readmates-platform-admin-service-spine-redesign-design.md`,
  `server/src/main/kotlin/com/readmates/notification/application/service/AdminNotificationReplayService.kt:35-151`,
  `server/src/main/kotlin/com/readmates/admin/operations/application/service/AdminOperationCaseService.kt:88-239`,
  `server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt:52-153`,
  `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminClubRegistryService.kt:39-89`,
  `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt:62-195`,
  `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt:146-223`,
  `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt:121-136`

## 컨텍스트

Platform admin mutation은 도메인별 성숙도가 다르다. Notification replay는 durable preview, actor binding,
selection hash, TTL, reason, locked confirm, atomic receipt를 갖춘다. Operation case lifecycle은
`expectedVersion` CAS, source revalidation, case event의 원자성을 갖지만 response-loss receipt와 global
audit 편입이 없다.

Support grant는 OWNER와 expiry/reason을 검사하지만 preview, version, idempotency receipt, active-duplicate
database constraint가 없고 grant write와 audit write가 하나의 transaction으로 결속되지 않는다. Club
metadata/public visibility, onboarding, domain command도 capability와 일부 transaction은 있으나 pinned
preview, revision, receipt, 완전한 audit가 없다. AI force-cancel/retry는 role/status CAS와 content-free
success audit만 있고 client revision, reason, preview, idempotency와 cross-store effect reconciliation이 없다.

Browser mutation은 same-origin BFF를 지나 Spring으로 전달된다. BFF secret, Origin/Referer, active
platform admin, application capability가 모두 필요하지만 endpoint별 CSRF matcher와 통합 테스트가 빠지면
정상 BFF POST가 403이 되거나 near-miss path가 의도와 다르게 허용될 수 있다. `ROLE_PLATFORM_ADMIN`은
route gate일 뿐 개별 command authority가 아니다.

모든 mutation에 무거운 preview를 강제하면 acknowledge 같은 가역적 운영 action의 사용성이 나빠진다.
반대로 외부 provider나 공개·권한 변경을 단순 confirm dialog로 처리하면 response loss, 부분 성공,
중복 실행, audit 분리에 취약하다. 영향과 복구 난이도를 반영하는 공통 안전 등급이 필요하다.

## 결정

Platform admin mutation은 임의 action name을 받는 범용 endpoint가 아니라 club, notification, AI,
support, admin operations 등 실제 business invariant를 소유한 application service의 typed command로
제공한다. Command는 다음 세 안전 등급으로 분류한다.

- **L1 — 가역적 lifecycle·derived refresh**: capability, domain-appropriate concurrency guard
  (expected version, CAS, lease 또는 monotonic observation token), 필요한 source 재검증, domain state와
  event history의 원자적 기록이 필수다. Case acknowledge/snooze/resolve와 domain recheck가 여기에 해당한다.
- **L2 — 권한·공개·대상 변경**: L1에 durable preview, impact review, final confirm, idempotency receipt,
  immutable audit를 추가한다. Support grant, club onboarding의 origin DB 변경, public visibility,
  대상이 고정된 recovery가 여기에 해당한다.
- **L3 — provider·cross-store effect**: L2에 origin mutation receipt, outbox 또는 convergence attempt
  ledger, 동일 receipt 기반 resume를 추가한다. AI recovery, invitation delivery, 이메일·알림 replay,
  public convergence가 여기에 해당한다.

한 command가 여러 effect를 가지면 가장 높은 등급을 적용한다. 예를 들어 onboarding의 club·host DB
변경은 L2지만 commit 이후 invitation email 전달까지 포함한 전체 workflow는 L3이며 origin receipt와
invitation delivery convergence가 같은 workflow identity로 연결된다.

L2/L3 preview는 opaque preview ID, canonical request 또는 selection hash, target identity,
domain-appropriate concurrency token, safe before/after·영향·차단·제외 정보 중 해당 command에 의미 있는
summary, actor/capability snapshot, 짧은 expiry를 고정한다. 의미 없는 0 count나 boilerplate reason을
만들지 않는다. Preview는 mutation이나 provider effect를 실행하지 않는다.

Confirm은 preview ID, canonical hash, domain concurrency token, idempotency key와 domain policy상 필요한
reason category·bounded/redacted note를 요구한다. Application service는 active actor, current capability,
target identity, preview expiry/consumption, concurrency token, 필요한 source freshness를 다시 확인한다.
하나라도 바뀌면 fail closed하고 최신 preview를 다시 검토하게 하며 자동 재실행하지 않는다.

Idempotency scope는 최소
`(platformAdminUserId, commandType, targetIdentity, idempotencyKey)`다. 같은 key와 같은 canonical
request는 저장된 receipt를 반환하고 같은 key의 다른 request는 conflict로 거절한다. Response loss 뒤
재시도는 새 mutation, 새 audit receipt, 새 provider effect를 만들지 않는다.

Operational claim identity와 HMAC key version alias는 분리한다. Claim은 actor·command·target scope,
canonical schema version, `IN_PROGRESS|COMPLETED`, CAS claim token과 domain receipt pointer만 가진다. Alias는
같은 scope, digest key version, idempotency-key HMAC, request HMAC과 claim ID를 가진다. Rotation overlap 동안
lookup과 새 alias write 모두 current·previous version을 사용해 같은 claim에 연결하며, `(scope, key version,
idempotency-key HMAC)` unique와 `(claim, key version)` unique를 함께 강제한다. Old-version writer drain을
확인한 뒤에는 새 alias는 current로만 쓰되 previous는 response-loss lookup에 유지한다. Dual-write가 켜진
동안에는 zero-reference retirement timestamp를 무효화하고, current-only drain 전환 이후 expired completed
claim purge가 previous alias를 제거한 시점부터 새 zero-reference 24시간 buffer가 끝난 뒤 previous key를
설정에서 제거한다. 따라서 rotation 전·후 key로 동시에 들어온 요청도 별도 claim을 만들 수 없고 lookup
호환성을 alias write 기간보다 먼저 끊지 않는다.

Canonical request identity는 ADR-0028의 versioned canonical HMAC 정책을 재사용한다. DTO validation과
default 적용 뒤 operation별 schema가 Unicode, field/collection order, null·omitted·default 의미를 고정한다.
Raw canonical payload나 평문 SHA digest를 저장하지 않고 server secret-keyed HMAC digest, canonical schema
version, digest key version만 저장한다. 이전 key는 해당 version alias가 모두 제거되고
`unreferenced_since` 이후 최소 24시간 rollout buffer가 끝난 뒤에만 폐기하며 reference 확인이 불가능하면
retirement를 fail closed한다.

Origin mutation claim은 domain application service의 transaction 안에서만 예약·완료한다. 여러 active key
alias는 deterministic version 순서로 예약하며 duplicate reconciliation은 savepoint로 전체 후보 insert를
되돌린 뒤 기존 claim을 조회한다. Origin claim에 persisted lease takeover나 bare `FAILED` terminal state를
두지 않는다. Transaction rollback이면 incomplete claim도 함께 사라져야 한다. Commit된 `IN_PROGRESS`가
관측되면 자동 takeover·재실행하지 않고 fail closed한다. L3의 lease는 origin receipt commit 이후 별도
convergence work에만 둔다.

Alias reservation은 쓰려는 모든 digest key state row를 global version 순서로 upsert·lock하고
`last_referenced_at`을 갱신하며 `unreferenced_since`를 지운다. 이 key-state 변경, claim, 모든 alias는 같은
savepoint와 outer transaction에 들어가 duplicate reconciliation rollback 때 함께 되돌아간다. Retirement도
같은 row와 순서를 lock한 뒤 alias 존재 여부를 다시 확인한다. Dual-write overlap에서는 기존
`unreferenced_since`를 지우며, writer drain과 current-only 전환이 끝난 뒤 alias가 0일 때만 새 timestamp를
시작·유지한다. 이 fresh locked zero-reference가 24시간 이상 지속된 뒤에만 key 제거 가능 상태를 반환한다.
따라서 claim과 retirement가 교차해 reference를 잃거나 premature key removal을 허용하지 않는다.

Secret 존재, version 범위, current·previous 조합만 검사하는 configuration syntax validator는 durable
rotation safety를 증명하지 못한다. 별도 database-backed startup validator는 Flyway가 V57 schema를 준비한
뒤 application readiness 전에 실행한다. Validator는 한 transaction에서 digest key state row를 global
version 순서로 lock하고 alias reference를 다시 조회한다. Referenced alias version에 대응하는 configured
key나 state row가 없거나, current·previous 어느 쪽으로도 알 수 없는 referenced version이 있으면 startup을
실패시킨다. 설정에서 제거된 historical version은 lock을 보유한 상태에서 alias가 0이고
`unreferenced_since`가 존재하며 그 시점부터 최소 24시간이 지난 경우에만 safely retired로 인정한다.
State timestamp만 읽거나 configuration-only validation으로 대체할 수 없고, reference/state query 또는
transaction이 실패해도 startup을 fail closed한다.

Response-loss 재호출에서는 같은 actor·command·target·key·request의 completed receipt lookup을
preview expired/consumed rejection보다 먼저 수행한다. Receipt lookup도 현재 active platform admin과
해당 receipt의 read capability를 다시 검사한다. Capability를 잃은 actor에게 sensitive receipt metadata를
반환하지 않는다.

MySQL 내부 mutation, immutable receipt, audit/outbox는 business orchestration owner의 한 transaction
또는 하나의 atomic persistence capability에서 결속한다. External provider 호출은 DB transaction 안에서
수행하지 않으며 commit된 convergence ID에 append-only attempt를 기록한다. Partial/failed/unknown 결과는
대상별 outcome과 retry eligibility를 보존하고 같은 receipt/convergence identity로 resume한다.

Receipt와 audit에는 actor ID와 당시 role/capability, immutable target identity, before/after state와
version, reason category와 redacted reason, result와 safe error code, preview/receipt/convergence identity를
기록한다. 이메일, invitation token, transcript, prompt/completion, private member content, provider raw
error, secret은 기록하지 않는다. Global audit ledger는 모든 L1 lifecycle event와 L2/L3 receipt를 조회할
수 있어야 하며 domain-local history만 존재하는 상태를 통합 감사로 표현하지 않는다.

Preview와 operational idempotency ownership row는 bounded retention과 안전한 cleanup을 가진다. Claim 생성
시점 expiry는 completion retention의 기준이 아니다. Completion CAS가 `expires_at`을
`completedAt + retention`으로 다시 설정하고 retention은 최소 24시간이다. 따라서 initial expiry 뒤까지
실행된 long-running command도 valid claim token으로 완료할 수 있고 완료 직후 purge되지 않는다. Purge는
이 completion-anchored retention이 지난 `COMPLETED` claim과 그 operational alias만 제거하며 committed
`IN_PROGRESS`를 자동 삭제해 새 실행을 열지 않는다. Immutable receipt는 삭제 가능한 target resource에
destructive FK를 두지 않고 redacted immutable target ID snapshot을 보존한다. Receipt 보존 기간과 접근
권한은 audit 정책과 일치시킨다.

Browser mutation은 same-origin BFF만 사용한다. BFF는 path를 정규화하고 browser가 보낸 내부 인증
header를 폐기한 뒤 server-only secret과 canonical Origin/Referer를 붙인다. Spring은 secret,
allowlisted origin, active platform admin과 command capability를 모두 다시 검사한다. BFF trust 검증 뒤
exact method/path만 CSRF 예외로 등록하며 near-miss method/path는 계속 보호한다. UI capability는 server
projection에서 파생하지만 server 재검사를 대체하지 않는다.

ADR-0037 emergency public takedown은 L3의 특수 command다. Host receipt를 재사용하지 않고 해당 ADR의
별도 capability, generation, convergence 계약을 따른다.

Notification replay confirm은 eligible event를 origin outbox mutation으로 확정한 receipt를 반환한다.
이 성공은 실제 delivery 완료를 뜻하지 않는다. 이후 delivery attempt와 outcome은 같은 workflow identity의
L3 convergence로 연결하고 response loss나 부분 실패도 그 identity로 resume한다.

### V59 service receipt와 convergence

이 절은 기존 결정을 대체하거나 이미 배포된 schema를 rewrite하는 것이 아니라 V59에 구현된 구체 계약을
기록한다. Club V58의 검증된
immutable receipt/current convergence/append-only attempt 구조를 기준으로 notification과 AI의 typed parent를
혼합하지 않는다.

V59 notification confirmation과 AI admin receipt는 각각 자기 도메인의 typed receipt다. 공통 convergence row는
`notification_receipt_id_snapshot`과 `ai_receipt_id_snapshot` 중 정확히 하나만 허용하는 XOR CHECK와 실제
`ON DELETE RESTRICT` FK를 가진다. `NOTIFICATION_REPLAY`는 notification parent만,
`AI_JOB_CANCEL|AI_COMMIT_RETRY`는 AI parent만 허용한다. Polymorphic string ID만 저장하거나 FK 없는
`domain_receipt_id`로 parent 존재를 application 주장에 맡기지 않는다.

각 receipt는 다음 deletion-safe immutable evidence를 공통으로 갖는다.

- actor user UUID snapshot, 당시 platform role과 bounded actor capabilities JSON;
- command/receipt kind, target kind, opaque target UUID snapshot, 필요한 club UUID snapshot;
- before/after state·revision, origin outcome과 safe result;
- canonical identity evidence와 origin timestamp;
- transaction 안에서 함께 쓴 `platform_audit_event_id_snapshot`의 unique logical link.

이 snapshot에는 deletable notification preview/delivery/event, AI job, user 또는 club FK를 두지 않는다. Notification
confirmation의 기존 destructive preview/actor/club/audit FK는 V59에서 snapshot semantics로 전환하되 immutable receipt
보존이 source hard delete를 막지 않게 한다. JSON은 type, item count와 encoded byte size를 모두 제한하고 raw
email/body/provider payload/prompt/completion/error/token/URL을 허용하지 않는다.

V48 legacy notification confirmation의 lowercase 64-hex `selection_hash`는 당시의 unkeyed SHA evidence로만
분류한다. 이를 HMAC이라고 rename하거나 key version을 지어내지 않는다. V59는 receipt identity mode와 DB CHECK로
다음 XOR을 강제한다.

- `LEGACY_SELECTION_SHA`: legacy SHA가 있고 canonical schema, digest key version, request HMAC은 모두 없다.
- `HMAC`: legacy SHA가 없고 canonical schema, non-negative digest key version, 32-byte request HMAC이 모두 있다.

AI receipt와 V59 이후 notification receipt는 `HMAC`만 쓴다. Legacy backfill은 deterministic receipt identity와
mode만 보강하고 원래 confirmation 의미·count를 바꾸지 않는다.

Service convergence current row는 immutable receipt parent, effect type과 opaque
`effect_target_id_snapshot`을 하나의 composite identity로 고정한다. Notification은 origin에서 고정한 replay
confirmation/target-set identity를, AI는 job UUID snapshot을 target으로 쓴다. Receipt당 허용 effect/target은
unique이고, current row는 receipt와 함께 유지한다. Mutable state는 `PENDING|SUCCEEDED|FAILED`, attempt count,
next attempt, bounded lease owner/expiry, next availability와 strict safe error code만 가진다.

각 attempt는 start event(seq 0)를 먼저 append하고, 같은 attempt의 outcome event(seq 1)가 generated composite
self-FK로 start를 참조한다. Event는 convergence ID, typed receipt parent, effect와 target snapshot까지 composite
RESTRICT FK로 묶어 orphan/mismatched history를 허용하지 않는다. Terminal current state는 attempt count가 1
이상이어야 하고, retryable/ambiguous outcome은 append-only event 뒤 같은 `PENDING` row의 safe error continuity와
다음 availability를 갱신한다. Provider raw error나 free text는 current/event 어느 쪽에도 기록하지 않는다.

Origin transaction과 convergence lease transaction은 분리한다. Receipt/audit/effect target/current convergence
insert는 origin business transaction에서 원자적이고, external I/O는 그 transaction 밖에서 수행한다. Worker는
짧은 lease+start-event transaction, 외부 effect 또는 authoritative observer 호출, 짧은 outcome CAS+event
transaction을 사용한다. Stale lease owner/attempt는 outcome을 적용하지 못한다. Notification convergence는
existing delivery engine을 관측할 뿐 다시 전송하지 않고, AI commit reconciliation은 existing
`AiGenerationCommitRecoveryService`에 위임할 뿐 별도 commit engine을 만들지 않는다.

## 근거

- 영향이 작은 lifecycle action을 과도하게 방해하지 않으면서 공개·권한·provider mutation을 강하게 잠근다.
- Domain service가 authorization, eligibility, transaction, retry, redaction을 계속 소유한다.
- Preview와 confirm 사이의 stale state, 같은 key의 다른 요청, response loss를 명시적으로 처리한다.
- DB mutation과 audit가 갈라지거나 provider effect가 중복되는 실패 모드를 줄인다.
- UI, BFF, Spring security 중 하나만 믿지 않는 defense-in-depth를 유지한다.
- Notification replay의 검증된 atomic preview/receipt 계약을 다른 위험 command의 기준으로 확장한다.
- V59 typed receipt FK와 append-only attempt evidence가 polymorphic orphan, source delete block, provider 성공 과장을
  schema와 transaction boundary에서 막는다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 범용 `/api/admin/execute`와 action registry | Business invariant와 authorization, transaction owner가 중앙 dispatcher로 새어 나온다. |
| 모든 mutation에 같은 preview-confirm | L1 운영 lifecycle까지 불필요하게 느려지고 반복 확인이 경고 무시를 만든다. |
| Browser confirm dialog만 추가 | stale state, duplicate request, response loss, audit atomicity를 해결하지 못한다. |
| Role만 검사 | 같은 role 안의 capability, active 상태, 민감 정보 접근 차이를 표현하지 못한다. |
| Provider 호출을 DB transaction 안에서 실행 | 긴 transaction과 불확실한 외부 결과 때문에 atomicity를 얻지 못한다. |
| Timeout 뒤 새 idempotency key로 재시도 | 이미 성공한 mutation과 외부 effect를 중복할 수 있다. |
| Domain-local audit만 유지 | 운영자가 한 ledger에서 사건과 command 결과를 재구성할 수 없다. |

## 결과

긍정적:
- Admin command의 최소 안전 요건과 구현·review checklist가 명확해진다.
- Conflict, duplicate, partial, response loss가 정상적인 domain outcome으로 모델링된다.
- Audit와 receipt가 실제 mutation에 원자적으로 결속되고 privacy allowlist를 공유한다.
- 새 mutation endpoint가 BFF와 Spring security 경계를 빠뜨리기 어려워진다.

부정적/감수한 비용:
- Preview/receipt persistence, canonical hashing, expiry cleanup, reconciliation query가 추가된다.
- L3 command는 origin transaction과 provider convergence를 나눠 구현해야 한다.
- 기존 support, club, AI endpoint는 additive compatibility와 migration이 필요하다.
- Global audit union과 privacy projection을 확장해야 한다.

## 검증

- L1은 allowed transition, domain concurrency guard의 success/conflict, source revalidation,
  state+history atomicity를 unit·integration test한다.
- L2/L3는 preview expiry/consumption, actor·capability loss, target/revision drift, reason validation을
  test한다.
- Same-key/same-request는 rotation 전·후 alias 모두 같은 receipt를 반환하고 same-key/different-request는 conflict인지 확인한다.
- Canonicalization schema, null/default/Unicode/collection order, HMAC key rotation과 old-key retirement를
  test한다.
- Response loss 재호출이 mutation, receipt, audit, provider effect를 중복하지 않는지 integration test한다.
- Completed receipt lookup이 expired/consumed preview rejection보다 우선하고 active actor/read capability를
  잃으면 sensitive metadata가 반환되지 않는지 확인한다.
- Partial failure가 대상별 outcome·skipped count·retry eligibility를 보존하는지 확인한다.
- MySQL write와 receipt/audit/outbox 중 하나가 실패하면 전체 origin transaction이 rollback되는지 확인한다.
- Origin claim의 rollback, committed `IN_PROGRESS` fail-closed, sorted dual-alias reservation과 savepoint rollback을 확인한다.
- Rotation overlap dual-write가 zero-reference timestamp를 무효화하고, writer drain 뒤 current-only alias write/previous lookup, alias purge, fresh locked zero-reference 24시간 buffer, key removal 순서를 확인한다.
- Claim과 key retirement 두 connection이 같은 key-state row lock으로 serialize되고 새 alias가 `unreferenced_since`를 지우는지 확인한다.
- Flyway 이후 Spring startup에서 current·previous valid config와 safely retired removed version만 허용하고, premature key removal, unknown referenced version, missing state, pending buffer, database failure를 모두 fail closed하는지 확인한다.
- Initial expiry를 넘긴 long-running claim completion이 성공하고 completion 시점부터 최소 24시간 retention을 다시 확보하는지 확인한다.
- External provider failure/resume가 origin claim takeover 없이 같은 convergence ID와 append-only attempt lease를 사용하는지 확인한다.
- Trusted BFF without Spring CSRF token 성공, missing/invalid secret·origin·active actor·capability 거절,
  exact path만 CSRF 예외이고 near-miss path는 보호되는지 full security chain으로 확인한다.
- DTO, receipt, audit, log, telemetry에 금지된 private content와 provider raw error가 없는지 검사한다.
- Global audit ledger에서 L1 event와 L2/L3 receipt를 actor·target·outcome으로 찾을 수 있는지 확인한다.
- Background polling과 load-more가 command concurrency token을 바꾸거나 pending action을 실행하지 않는지,
  Escape·backdrop·navigation·browser back이 confirm request를 0건 만드는지 확인한다.
- Source-driven reopen만 가능하고 operator 임의 reopen command가 없는지 확인한다.
- Concurrent support grant create가 DB constraint와 idempotency로 하나의 origin mutation만 만드는지 확인한다.
- Flyway clean/upgrade, ADR-0009 Zod DTO fixture, compatibility endpoint의 duplicate-effect 방지를 검증한다.
- Global audit의 role/capability별 redaction과 admin frontend의 host mutation client 비의존을 확인한다.
- V59 fresh/legacy migration에서 typed receipt parent XOR/FK, receipt/effect/target composite identity, actor
  role/capability snapshot, unique audit snapshot, legacy SHA/HMAC XOR와 deletion-safe hard delete를 확인한다.
- Convergence event가 같은 attempt의 start event와 typed parent/effect/target을 모두 참조하고 terminal attempt
  count, pending retry continuity, stale lease CAS와 safe error regex를 강제하는지 negative MySQL test한다.

## 구현 결과

- Mutation inventory, typed migration/compatibility route, AI POST CSRF/BFF 경로, support duplicate 및
  grant/audit atomicity, club public visibility typed command가 구현되었다.
- Code, V59/V60 migration, integration/security tests, global audit와 active architecture가 이 계약과 일치한다.
