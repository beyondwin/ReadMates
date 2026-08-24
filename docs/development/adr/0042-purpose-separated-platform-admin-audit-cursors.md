# ADR-0042: 플랫폼 어드민 audit cursor를 V57 digest key로 서명

- 상태: Proposed
- 결정일: 2026-08-24
- 작성자: 플랫폼 운영·보안·서버
- 관련: ADR-0028, ADR-0033, ADR-0040,
  `server/src/main/kotlin/com/readmates/admin/audit/application/service/AdminAuditLedgerService.kt:35-101`,
  `server/src/main/kotlin/com/readmates/shared/adminmutation/config/AdminCommandIdentityProperties.kt:12-29`,
  `server/src/main/kotlin/com/readmates/shared/adminmutation/config/AdminCommandIdempotencyProperties.kt:18-56`,
  `server/src/main/kotlin/com/readmates/shared/adminmutation/config/AdminCommandDigestKeyStartupValidator.kt:12-92`

## 컨텍스트

현재 audit ledger는 source별 첫 page를 읽은 뒤 application memory에서 filter·sort하고, 다음 row를 일반
cursor로 encode한다. Cursor가 snapshot upper bound, 전체 normalized filter와 unavailable source set을
인증하지 않으면 filter를 바꾼 continuation, page 사이 삽입, source 장애 복구가 누락·중복 또는 권한 경계
우회로 이어질 수 있다.

V57 platform-admin command protocol에는 current/previous HMAC key, version, DB-backed rotation state와 최소
24시간 fresh post-drain retirement buffer가 이미 있다. Audit cursor 때문에 별도 secret과 rotation runbook을
추가하면 같은 운영자가 두 lifecycle을 독립적으로 안전하게 유지해야 한다. 반대로 command request와 cursor에
같은 purpose를 쓰면 한 protocol의 입력이 다른 protocol에서 유효한 MAC으로 해석될 수 있다.

Audit cursor는 짧은 수명의 client-held capability다. DB reference row를 cursor마다 만들지 않으면서도 previous
key 제거가 아직 유효한 cursor를 깨뜨리지 않는 TTL·rotation 불변식이 필요하다.

## 결정

Audit cursor는 V57 `readmates.admin.command-identity` current/previous key material을 재사용하되, command
identity와 다른 고정 purpose `readmates:platform-admin-audit-cursor:v1`로 HMAC-SHA-256 domain
separation한다. 별도 cursor secret은 추가하지 않는다.

### Cursor envelope와 privacy

Cursor v1은 canonical binary envelope와 32-byte MAC을 URL-safe opaque string으로 encode한다. Envelope는
field별 unsigned 32-bit big-endian byte length와 고정 순서를 사용하며 다음 값만 포함한다.

- cursor schema version과 digest key version;
- `issuedAt`, `expiresAt`, first-page `snapshotTo`, normalized `from`;
- normalized share-safe filter와 sensitive body filter를 함께 bind한 filter HMAC;
- page one에서 고정한 `excludedSources`의 versioned set;
- 마지막 visible row의 `occurredAt`, immutable source rank, source discriminator와 native immutable ID.

Cursor payload·MAC·log에는 이름, 이메일, user/member UUID, support note, raw reason, provider error, prompt,
notification body, raw source JSON 또는 secret을 넣지 않는다. Sensitive target은 cursor payload에 복사하지 않고
normalized request filter HMAC에만 bind한다. Cursor decode/validation failure는 값이나 MAC을 log하지 않고 하나의
safe `INVALID_CURSOR`로 수렴한다. Browser는 cursor를 share URL, history, storage 또는 analytics에 넣지 않고
infinite-query memory에서만 보유한다.

### Issue와 verify

- 새 cursor는 **current key로만** issue하고 envelope에 current key version을 pin한다.
- Verify는 envelope key version이 current 또는 configured previous인지 먼저 확인하고 해당 한 key로 기대 MAC을
  계산한다. MAC 비교는 constant-time이고, parse·schema·expiry·filter·snapshot·source-set 검증 결과를 모두
  모아 fail closed한다.
- Unknown, removed, blank 또는 key/version 조합이 맞지 않는 cursor는 previous와 current를 임의 순회하거나
  fallback하지 않고 거절한다. 새 issue에 previous key를 쓰지 않는다.
- Cursor TTL은 non-secret `readmates.admin.audit.cursor-ttl`로 관리하고 default는 1시간이다. TTL은
  `Duration.ZERO`보다 크고 `readmates.admin.command-idempotency.previous-key-rollout-buffer`보다 **엄격히
  짧아야** 한다. 같거나 길면 startup을 실패시킨다.

### Rotation, startup과 retirement

Audit cursor는 DB key reference count에 포함하지 않는다. 다음 불변식이 그 대신 안전성을 증명한다.

1. Cursor는 current-only issue이고 TTL은 fresh post-drain retirement buffer보다 엄격히 짧다.
2. Rotation overlap 진입은 previous key의 기존 `unreferenced_since`를 무효화한다.
3. Old writer drain과 current-only alias 전환 뒤, DB-backed durable reference가 0인 locked snapshot에서 fresh
   retirement buffer를 새로 시작한다.
4. Previous key는 그 buffer가 전부 지난 뒤에만 제거된다. 따라서 rotation 직전 old-current로 발급한 cursor도
   제거 시점 전에 만료된다.

Flyway 뒤 readiness 전에 기존 DB-backed startup validator가 configured/referenced key 상태를 검증하고, audit
cursor validator가 key syntax와 cursor TTL 불변식을 같은 startup phase에서 검증한다. Missing key/state,
unknown durable reference, DB query failure, non-positive TTL, `cursorTtl >= previousKeyRolloutBuffer`는 startup을
fail closed한다. Rotation overlap과 retirement assessment는 cursor TTL 불변식이 깨진 configuration에서
`REMOVABLE`을 반환하지 않는다.

향후 cursor TTL을 buffer 이상으로 늘리거나 previous key로 새 cursor를 issue하거나 fresh post-drain buffer를
무효화하지 않는 rotation으로 바꾸면 이 증명은 성립하지 않는다. 그런 변경 전에 unexpired cursor key version을
durable reference로 계수하거나 cursor 전용 key lifecycle을 별도 ADR로 정해야 한다.

## 근거

- V57의 검증된 secret 배포와 DB-backed retirement lifecycle을 재사용한다.
- Purpose separation이 command request/idempotency HMAC과 cursor MAC의 교차 protocol 재사용을 막는다.
- Current-only issue와 strict TTL-buffer invariant가 cursor별 DB row 없이 old-key verification window를 보장한다.
- Sensitive body filter를 payload에 넣지 않고도 continuation을 같은 filter에 묶는다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| Audit cursor 전용 secret | Cryptographic blast radius는 좁지만 secret 배포, rotation, startup, retirement와 runbook을 하나 더 만든다. |
| V57 command identity purpose를 그대로 사용 | 서로 다른 canonical input protocol의 domain separation이 사라진다. |
| Current key로만 issue·verify | Rotation 직전 발급한 유효 cursor가 key 전환 즉시 깨진다. |
| Previous key로도 새 cursor issue | Old-key reference가 계속 생성되어 retirement proof와 writer drain 의미가 무너진다. |
| Cursor마다 DB reference 저장 | 정확하지만 짧은 pagination capability를 persistent cleanup 업무로 만들며 현재 TTL-buffer 증명보다 복잡하다. |
| Unsigned Base64/JSON cursor | Filter, snapshot, source set과 continuation tuple 변조를 검출하지 못한다. |

## 결과

긍정적:
- Audit pagination이 snapshot/filter/source failure 계약과 cryptographically 결속된다.
- 별도 secret 없이 key rotation 중 current/previous cursor를 안전하게 검증한다.
- Cursor와 실패 telemetry가 private audit filter를 노출하지 않는다.

부정적/감수한 비용:
- Audit cursor TTL이 admin digest fresh retirement buffer보다 짧게 제한된다.
- V57 key compromise는 command identity와 audit cursor 모두에 영향을 준다.
- Startup validator와 retirement test matrix가 cursor TTL 불변식까지 소유해야 한다.

## 검증

- Byte-exact canonical envelope, purpose, field order/length prefix, current-only issue와 key-version pinning을 unit
  test한다.
- Payload 또는 MAC의 모든 byte mutation, schema/filter/snapshot/source-set mismatch, expiry, unknown/removed key와
  constant-time comparison path가 `INVALID_CURSOR`로 fail closed하는지 test한다.
- Rotation 직전 old-current cursor가 overlap 중 previous로 검증되고, current 전환 뒤에는 current로만 issue되며,
  cursor TTL이 지난 fresh buffer 뒤에만 old key가 removable인지 boundary-clock test한다.
- `cursorTtl <= 0`, `cursorTtl == previousKeyRolloutBuffer`, 더 긴 TTL, missing key/state와 DB reference query
  failure가 startup을 중단하는지 test한다.
- Sensitive target/name/email/member UUID/note가 cursor payload, DTO, log, metric, URL/history/storage에 없는지
  security/privacy test한다.

## 후속 작업

- Review Workbenches Task 4가 signer, property/startup validation, source-aware pagination과 security/privacy tests를
  함께 구현한다.
- Code, tests, active architecture와 rotation runbook이 이 계약과 일치한 뒤에만 `Accepted`로 승격한다.
