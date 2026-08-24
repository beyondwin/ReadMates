# ADR-0041: 플랫폼 어드민 초대 전달 토큰을 도메인 분리 HMAC으로 재생성

- 상태: Proposed
- 결정일: 2026-08-24
- 작성자: 플랫폼 운영·보안·서버
- 관련: ADR-0028, ADR-0033, ADR-0040,
  `server/src/main/kotlin/com/readmates/auth/application/service/InvitationTokenService.kt`,
  `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminOnboardingService.kt`,
  `server/src/main/kotlin/com/readmates/club/application/service/PlatformAdminHostInvitationConvergenceService.kt`,
  `server/src/main/kotlin/com/readmates/club/adapter/out/security/PlatformAdminInvitationTokenDeriver.kt`,
  `server/src/main/kotlin/com/readmates/shared/security/RequestIdentityHmac.kt`,
  `server/src/main/resources/db/mysql/migration/V57__platform_admin_command_idempotency.sql`,
  `server/src/main/resources/db/mysql/migration/V58__platform_admin_club_command_receipts.sql`

## 컨텍스트

현재 platform-admin onboarding은 commit transaction 안에서 무작위 invitation token과 그 SHA-256 hash를
만든 뒤, raw token을 포함한 URL을 메모리에 들고 transaction 밖에서 메일을 한 번 보낸다. Origin commit
뒤 process가 종료되거나 SMTP 결과가 불명확하면 DB에는 유효한 invitation과 `token_hash`가 남지만 worker가
같은 링크를 복구할 재료가 없다. Raw token이나 URL을 receipt, audit, convergence, log, DTO에 저장하면
ADR-0040의 privacy 경계를 깨고 DB 또는 운영 projection이 곧 invitation capability 저장소가 된다.

V58은 onboarding origin의 immutable receipt와 `HOST_INVITATION` convergence를 제공하지만 effect가 가리키는
invitation identity를 고정하지 않는다. 기존 notification outbox는 recipient email, body, deep link를 평문으로
저장하고 deletable club FK를 가지므로 이 capability의 저장소로 재사용할 수 없다. SMTP transport는
`PERMANENT`, `RETRYABLE`, `AMBIGUOUS`를 구분하지만 provider exactly-once 또는 공통 idempotency key를 제공하지
않는다.

ADR-0040은 L3 command의 origin과 provider convergence를 분리하고 raw invitation token을 evidence에서
제외하도록 정했다. 이 ADR은 ADR-0040을 refine하며 supersede하지 않는다. Onboarding invitation delivery를
crash 뒤에도 같은 workflow identity로 복구하기 위한 token 생성·rotation·retry 계약만 구체화한다.

## 결정

### Preview와 confirm identity

Onboarding preview는 DTO validation과 default 적용 뒤 versioned canonical schema로 정규화한 전체 command를
입력으로 받는다. Preview row에는 raw canonical command, email, token, URL을 저장하지 않는다. Actor와 capability
snapshot, synthetic new-club slot, canonical schema version, **현재** digest key version의 request HMAC, 짧은
expiry와 allowlist된 safe impact만 저장한다. Preview response도 normalized public-safe label, 영향·차단 code,
matched identity category, opaque preview ID, expiry와 짧은 fingerprint만 반환한다.
Club name, tagline, first-host name/email은 DB 문자 경계 안에서 single-line 값만 허용하고 line/control 문자를
거절한다. Club about은 MySQL `TEXT` 경계에 맞춰 UTF-8 65,535 bytes 이하로 제한하되 line feed는 보존하고 CRLF는
canonical line feed로 정규화한다. Preview와 confirm은 이 같은 validation과 normalization 함수를 공유한다.

Confirm은 preview ID만 신뢰하지 않고 preview 때와 같은 전체 command, idempotency key와 명시적 확인 code를
다시 받는다. Application service는 현재 active actor와 command capability를 먼저 확인하고 command를 같은
schema로 정규화한 뒤, preview expiry·consumption 거절보다 먼저 ADR-0040의 shared idempotency claim을 수행한다.

- `Completed`는 현재 actor와 receipt read capability를 다시 확인하고 기존 receipt를 반환한다. Preview row가
  이미 소비·만료·정리됐더라도 새 club, membership, invitation, audit 또는 delivery effect를 만들지 않는다.
- Same-key/different-request `Conflict`와 commit된 `InProgress`는 fail closed한다.
- 새 `Claimed`만 actor/capability snapshot, target slot, expiry, consumption과 current source conflict를 잠근 뒤
  검증한다. Preview가 고정한 key version으로 full command request HMAC을 다시 계산해 constant-time 비교한다.
- Preview 검증 또는 origin write가 실패하면 claim/key-state 변경을 포함한 outer transaction 전체를 rollback한다.

### Invitation delivery token

새 사용자 host invitation은 V57의 platform-admin command identity **current/previous key material**을 재사용하되,
request/idempotency HMAC과 다른 고정 purpose
`readmates:platform-admin-host-invitation-token:v1`로 domain separation한다. 별도 secret은 추가하지 않는다.

Origin transaction은 invitation UUID와 club UUID를 먼저 정한 뒤 다음 입력으로 HMAC-SHA-256을 한 번 계산한다.

```text
tokenBytes = HMAC-SHA-256(
  key = key[receipt.digestKeyVersion],
  purpose = "readmates:platform-admin-host-invitation-token:v1",
  input = u32be(len(invitationIdAscii)) || invitationIdAscii ||
          u32be(len(clubIdAscii))       || clubIdAscii
)
rawToken = base64urlWithoutPadding(tokenBytes)
```

UUID는 repository canonical lowercase string의 ASCII bytes를 사용하고 각 field는 unsigned 32-bit big-endian
byte length로 경계를 고정한다. Receipt의 `digest_key_version`이 생성 key version을 pin한다. 기존 invitation
acceptance 계약과 호환되도록 `invitations.token_hash`에는 기존 `InvitationTokenService.hashToken(rawToken)`의
SHA-256 결과만 저장하며 raw token은 저장하지 않는다. HMAC 결과는 32 bytes라서 기존 random token과 같은
256-bit capability 공간을 유지한다.

V58 convergence에는 `effect_target_id_snapshot CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL`을
추가한다. `HOST_INVITATION`은 invitation UUID, `DOMAIN_PROVISIONING`은 domain UUID를 저장하고 기존의 receipt당
effect type 하나라는 unique 경계와 함께 `(receipt, effect type, effect target)` identity를 고정한다. Snapshot에는
deletable invitation, club, user FK를 두지 않는다. 이 변경은 아직 feature-local이고 미출시인 V58을 Task 4
stack에서 보강한다. Service operations에 예약된 V59를 사용하지 않는다.

Delivery worker는 짧은 claim/lease transaction에서 `PENDING HOST_INVITATION` work를 잡고, transaction 밖에서
receipt의 digest key version과 convergence target invitation UUID, invitation의 club UUID를 읽어 raw token을
다시 계산한다. Invitation이 여전히 같은 club의 `PENDING` row이고 만료·수락·철회되지 않았는지도 authoritative
row로 다시 확인한다. 계산한 raw token의 SHA-256을 저장된 `token_hash`와 constant-time 비교해 mismatch나
missing key를 fail closed한 뒤에만 receipt `safe_result_json`의 allowlist된 club slug snapshot과 canonical
application origin으로 transient mail command와 accept URL을 만든다. Token, URL과 email body는 method-local
memory를 벗어나 receipt,
convergence event, audit, log, metric label, exception message 또는 response DTO에 들어가지 않는다.

Worker 활성화는 `readmates.notifications.enabled`와 `readmates.notifications.worker.enabled`가 모두 true인
경우에만 허용한다. Claim lease, fixed delay, batch size, retry delay와 max delivery attempts는 기존 notification
runtime properties를 그대로 사용하며, retry delay 목록이 모든 nonterminal attempt를 덮지 못하면 startup에서
fail closed한다.

Retry는 같은 receipt, convergence, invitation UUID, club UUID와 digest key version을 사용하므로 항상 같은
raw token과 같은 링크를 만든다. SMTP에 stable provider/message identity를 전달할 수 있으면 convergence
identity를 사용하지만, SMTP 자체에는 exactly-once가 없다. Send 성공 뒤 outcome CAS 전에 process가 죽거나
`AMBIGUOUS`가 반환되면 같은 링크의 메일이 중복 전달될 수 있다. 이 at-least-once 경계는 허용하되 두 번째
invitation, token 또는 receipt는 만들지 않는다. `RETRYABLE`과 `AMBIGUOUS`는 bounded retry 동안 `PENDING`을
유지하고 append-only attempt event를 남긴다. `PERMANENT` 또는 exhausted policy만 terminal `FAILED`가 된다.

기존 user를 host로 배정하는 onboarding에는 invitation이나 `HOST_INVITATION` convergence를 만들지 않는다.
새 user onboarding의 origin club·invitation commit은 mail 전송과 독립적으로 `SUCCEEDED` receipt를 만들고
delivery는 `PENDING`에서 시작한다. `readmates.notifications.enabled=false`이면 worker는 work를 claim하거나
mail adapter를 호출하거나 성공 처리하지 않고 `PENDING`을 유지한다. Disabled no-op mail adapter의 반환을
delivery 성공 증거로 사용하지 않는다.

이 workflow에는 새 V59, 새 secret/config, plaintext capability outbox, encrypted command/token payload 또는
retry별 random token을 추가하지 않는다.

### Key rotation과 retirement

`PENDING HOST_INVITATION` convergence는 receipt의 `digest_key_version`에 대한 durable key reference다. V57
key-state lock, retirement assessment와 database-backed startup validation은 idempotency alias뿐 아니라 이
reference도 같은 transaction과 global version lock 순서로 집계해야 한다. Reference query, state row 또는
configured key가 없거나 불일치하면 startup과 retirement를 fail closed한다. `PENDING` reference가 하나라도
있으면 previous key를 제거할 수 없다. Terminal delivery 뒤 invitation acceptance는 저장된 `token_hash`만
사용하므로 `SUCCEEDED|FAILED` convergence는 delivery token key를 계속 참조하지 않는다.

Unexpired preview는 별도 durable key reference로 집계하지 않는다. 대신 다음 불변식을 모두 강제한다.

1. Preview는 current key로만 만들며 previous key로 새 preview를 만들지 않는다.
2. Onboarding preview TTL은 shared command-idempotency `preview-ttl`을 사용하고 현재 기본값은 10분이다. Startup
   validation은 configured TTL이 양수이고 `previous-key-rollout-buffer`보다 **엄격히 짧은지** 확인한다. Existing
   buffer validator의 최소값은 24시간이다.
3. Rotation overlap 진입은 old-current/new-previous key-state row를 lock하고 기존 `unreferenced_since`를
   무효화한다. Writer drain과 current-only 전환이 끝난 뒤 reference 0을 같은 lock 아래 다시 확인한 시점부터
   fresh post-drain buffer를 새로 시작한다.
4. Previous key는 그 fresh zero-reference buffer 전체가 지난 뒤에만 제거한다.

따라서 rotation 직전 old current key로 만든 preview도 key 제거 전에 만료되고, overlap 중 preview는 새 current
key만 사용한다. Configured TTL이 buffer 이상으로 허용되거나 overlap이 old-key buffer를 무효화하지 않는 설계로
바뀌면 이 증명은 성립하지 않으므로, 그 변경 전에 unexpired preview를 key reference query와 lock protocol에
포함해야 한다.

### Transaction, startup, rollback

Claim, club/host/invitation origin write, domain audit, platform audit snapshot, immutable receipt,
`HOST_INVITATION|DOMAIN_PROVISIONING` convergence insert, preview consume와 claim completion은 ADR-0033의
business orchestration owner가 소유하는 한 transaction이다. Mail I/O와 domain provider I/O는 이 transaction
안에서 실행하지 않는다. Optional domain은 origin commit 뒤 기존 Task 3 domain convergence lease/관측/CAS
경로로 첫 시도를 수행하며, host invitation effect와 같은 receipt 아래에서 독립적으로 수렴한다.

Worker는 짧은 lease/start-event transaction, 외부 send, 짧은 outcome CAS/event transaction으로 나눈다.
Lease owner, attempt number와 state가 달라지면 stale worker의 outcome은 적용하지 않는다. Rollback은 origin
transaction이 commit되지 않은 club, invitation, receipt, audit, preview consumption과 convergence를 모두
남기지 않는다는 뜻이다. Delivery transaction rollback은 lease/CAS와 append-only event를 일치시키지만 이미
SMTP가 받아들인 메일을 취소하지 못한다.

Startup은 current/previous key syntax만 검사해서는 안 된다. Flyway 뒤 readiness 전에 locked DB snapshot으로
idempotency alias, `PENDING HOST_INVITATION`, fresh buffer와 preview-TTL 불변식을 검증한다. Unknown referenced
version, prematurely removed key, missing target/receipt, query failure는 모두 startup 실패다.

## 근거

- Raw capability를 저장하지 않고도 crash와 retry 뒤 같은 invitation link를 복구한다.
- 기존 invitation acceptance와 V57 배포·rotation surface를 재사용하고 새 secret 운영을 만들지 않는다.
- Purpose와 length-prefix가 request identity HMAC 및 field concatenation과의 교차 protocol 충돌을 막는다.
- Origin atomicity와 provider at-least-once 경계를 구분해 성공을 지어내지 않는다.

Domain-separated key reuse는 새 secret과 AEAD lifecycle을 피하지만 V57 key compromise의 blast radius와
retirement coupling을 넓힌다. DB만 유출되면 raw token을 복구할 수 없지만, 해당 key와 invitation/club UUID를
함께 얻은 공격자는 pending delivery link를 계산할 수 있다. 이 비용을 짧은 preview TTL, durable pending
reference, fail-closed startup/retirement와 evidence 비저장으로 제한한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| Confirm이 preview ID와 보호된 command payload만 전송 | Email을 포함한 private command를 저장·운반하려면 별도 AEAD key, nonce, format, rotation 계약이 필요하다. Confirm은 full command를 다시 보내는 쪽이 canonical identity와 privacy 경계가 단순하다. |
| 초대 전달 전용 새 secret | Cryptographic separation은 강하지만 deploy, startup, rotation, retirement와 public-safe config surface를 하나 더 만든다. 현재 범위는 purpose-separated V57 key reuse의 trade-off를 받아들인다. |
| 암호화한 raw token 또는 operational payload 저장 | Plaintext 노출은 줄지만 decryptable capability와 AEAD lifecycle이 DB에 남고 key retirement가 더 복잡해진다. |
| Retry마다 새 random token 생성 | 이미 전달됐을 수 있는 링크를 무효화하고 invitation update와 response-loss race에서 여러 capability를 만든다. |
| 기존 notification outbox에 URL/token 저장 | Outbox가 plaintext body/deep link와 deletable club FK를 가지므로 privacy와 immutable evidence 경계에 맞지 않는다. Mail transport와 safe failure taxonomy만 재사용한다. |
| Origin transaction 안에서 동기 SMTP 발송 | 긴 DB transaction과 SMTP unknown outcome을 결합해도 atomic delivery를 만들 수 없다. |

## 결과

긍정적:
- Onboarding origin response loss와 worker crash가 같은 receipt·invitation·link로 수렴한다.
- Receipt/audit/DTO/log에 raw invitation capability를 두지 않는다.
- Key가 필요한 pending work와 safely removable key를 DB-backed evidence로 구분한다.

부정적/감수한 비용:
- Pending delivery가 오래 남거나 notifications가 꺼져 있으면 해당 digest key retirement가 계속 막힌다.
- SMTP ambiguous failure 뒤 같은 링크의 duplicate email은 가능하다.
- V58 target snapshot, worker, key-reference query와 startup/rotation test가 추가된다.

## 검증

- Preview/confirm canonicalization matrix, full-command mismatch, actor switch, expiry/consumption과 current
  capability loss를 test한다.
- Completed replay가 missing·expired·consumed preview보다 먼저 기존 receipt를 반환하고 현재 read capability를
  잃은 actor는 거절하는지 test한다.
- Purpose, UUID field order/length prefix와 digest key version이 같으면 token/link가 byte-exact하게 같고,
  invitation ID, club ID, key version 또는 purpose가 다르면 달라지는지 test한다.
- 생성 token의 hash로 기존 invitation acceptance가 성공하고 raw token/URL이 DB schema/row, receipt, audit,
  DTO, `toString`, log와 metric에 없는지 test한다.
- Origin transaction 각 write failure가 claim부터 convergence까지 전부 rollback하고 mail 호출은 0건인지
  MySQL integration test한다. Optional domain은 기존 domain convergence reader가 onboarding receipt의 safe origin
  status/updated-at snapshot을 읽어 transaction 밖에서 target CAS하고, 같은 receipt의 host effect를 변경하지 않는지
  검증한다.
- Crash-after-send, `AMBIGUOUS`, `RETRYABLE`, `PERMANENT`, attempt exhaustion과 concurrent worker lease/CAS를
  test하고 retry마다 같은 link인지 확인한다.
- Notifications disabled에서 claim/send/success가 0건이고 work가 `PENDING`인지 확인한다.
- Old key의 `PENDING HOST_INVITATION` reference가 retirement와 startup을 막고 terminal 뒤 alias까지 0이며
  fresh locked buffer가 끝나야 removable인지 두 connection concurrency test한다.
- Preview TTL이 rollout buffer보다 짧지 않으면 startup이 실패하고, overlap 진입이 기존 retirement timestamp를
  무효화하며 rotation 직전 preview가 key 제거 전에 만료되는 boundary-clock test를 추가한다.
- V58 fresh/legacy Flyway test는 convergence target snapshot의 UUID/collation, composite identity, no destructive
  FK와 V59 reservation 불변을 확인한다.
- Public-release safety scan은 token-shaped fixture, raw email, URL, secret과 private path가 새 docs/source/fixture에
  들어오지 않았는지 확인한다.

## 후속 작업

- Task 4는 V58에 convergence effect target snapshot을 추가하고 receipt/worker/key retirement/startup protocol을
  구현한다. 새 V59 migration이나 새 secret은 만들지 않는다.
- Implementation plan은 이 ADR을 ADR impact `new`, 상태 `Proposed`로 참조한다. Code, migration, tests,
  active architecture와 operator rotation evidence가 모두 일치한 뒤에만 `Accepted`로 승격한다.
- Terminal failure 뒤 새 invitation을 발급하는 별도 operator workflow가 필요해지면 기존 receipt/link를
  암묵적으로 바꾸지 말고 별도 command decision으로 검토한다.
