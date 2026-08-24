# ADR-0043: 플랫폼 어드민 support access 사유 evidence를 최소화

- 상태: Proposed
- 결정일: 2026-08-24
- 작성자: 플랫폼 운영·보안·서버·프런트엔드
- 관련: ADR-0030, ADR-0033, ADR-0039, ADR-0040,
  `server/src/main/resources/db/mysql/migration/V21__multi_club_platform.sql:72-89`,
  `server/src/main/kotlin/com/readmates/club/application/service/SupportAccessGrantService.kt:37-83`,
  `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcSupportAccessGrantAdapter.kt:30-66`,
  `server/src/main/kotlin/com/readmates/auth/application/service/DefaultAuthoritySynthesisService.kt:42-49`

## 컨텍스트

현재 `support_access_grants.reason`은 최대 500자의 자유 입력을 평문으로 저장하고 ledger가 그대로 읽는다.
입력자가 장애 맥락을 설명하면서 이메일, 이름, 회원 식별자 또는 private content를 사유에 복사할 수 있고,
그 값이 grant row, DTO, audit metadata와 장기 evidence로 확산될 수 있다. L2 preview/confirm과 immutable receipt를
추가하면서 기존 free-text 사유를 그대로 복제하면 안전 명령 protocol이 오히려 private data의 새 보존 경로가
된다.

한편 `HOST_SUPPORT_READ` grant는 membership row를 만들지 않지만, 요청 단위로 기존
`DefaultAuthoritySynthesisService`가 transient `ROLE_HOST`를 합성해 host read path를 재사용한다. 이를 normal
membership으로 오해해 제거하면 현재 support access 자체가 깨지고, 반대로 persistent host role처럼 노출하면
platform authority와 club membership authority가 섞인다.

## 결정

Support grant create/revoke command의 durable reason은 allowlist된 `reasonCategory`, `notePresent`, canonical
request HMAC과 digest key version만 저장·노출한다. Optional bounded note는 confirm request memory에서 canonical
request HMAC 계산과 operator review에만 사용하고 DB, receipt, audit, DTO, log, metric, trace, URL, browser
history/storage 또는 query-cache serialization에 평문·ciphertext·별도 note digest로 저장하지 않는다. 별도
encrypted note store도 만들지 않는다.

### New-write contract

- `reasonCategory`는 versioned uppercase ASCII allowlist다. V60 최초 allowlist는
  `INCIDENT_INVESTIGATION`, `MEMBER_ASSISTANCE`, `DATA_CORRECTION`, `SECURITY_REVIEW`다. `OTHER`와 임의
  string은 허용하지 않는다.
- `notePresent`는 trim/NFC 후 note가 비어 있지 않았다는 boolean evidence일 뿐 내용이나 길이를 복원하지 못한다.
- Full normalized command에는 actor, target club, operational grantee UUID, scope, expiry, reason category,
  `notePresent`와 normalized note가 들어가 request HMAC을 만든다. Receipt에는 HMAC/key version만 남기므로
  same-key/different-note conflict는 검출하지만 note는 복구할 수 없다.
- Reason evidence와 immutable preview/receipt/audit projection은 raw note, email, name, display label 또는
  grantee/member UUID를 포함하지 않는다. Create preview는 full normalized confirm command의 request HMAC과 opaque
  create slot만 보존하고, receipt/audit target은 grant UUID를 사용한다. Active authorization row의 `club_id`,
  `grantee_user_id`, scope와 expiry는 권한 판정을 위한 operational state로만 존재하고, immutable evidence,
  reason field나 safe metadata에 중복하지 않는다.
- Search response의 masked display는 ephemeral workbench selection용이며 receipt/audit/ledger reason evidence로
  복사하지 않는다. Sensitive lookup은 body-only, `no-store`, capability gated 계약을 유지한다.

### Legacy plaintext treatment

V60은 migration 직전의 legacy `reason`을 application이나 DTO로 다시 읽지 않고 모든 기존 row를 다음 safe
projection으로 일괄 변환한다.

- `reason_category = 'LEGACY_UNCLASSIFIED'`
- `note_present = true`
- raw `reason` value는 같은 migration에서 고정 sentinel로 overwrite한다. Rolling reader 호환 때문에 column을
  잠시 유지해야 하면 arbitrary text를 거절하는 CHECK로 sentinel-only compatibility column으로 좁히고, 모든
  reader가 이관된 뒤에만 후속 migration에서 drop한다.

Legacy raw reason의 post-V60 retention은 **0일**이다. Sentinel-only compatibility column은 plaintext retention이
아니다. 원문을 archive, audit metadata, migration evidence,
backup용 새 table 또는 log로 복사하지 않는다. V60 migration evidence는 redacted row count만 기록하며 grant,
club, user ID나 원문을 포함하지 않는다. Migration 전에 별도 법적 보존이 필요하다는 요구가 생기면 배포를
중단하고 제한 접근·기간·삭제를 정하는 새 결정이 먼저 필요하다.

### Authority boundary

이 결정은 기존 `HOST_SUPPORT_READ` authority adapter를 제거하지 않는다. Active, unexpired grant와 exact club
context가 있을 때 요청 principal에 transient `ROLE_HOST`와 request-local support synthesis를 붙이는 현재
동작을 유지한다. 이 role은 다음 경계를 갖는다.

- membership table을 생성·수정하지 않고 normal membership DTO에 노출하지 않는다;
- request가 끝나거나 grant가 만료·철회되면 지속되지 않는다;
- grant scope 밖의 write capability나 platform-admin capability를 확장하지 않는다;
- audit/receipt의 actor role snapshot은 실제 platform role과 support scope를 기록하며 synthetic
  `ROLE_HOST`를 persisted membership role로 기록하지 않는다.

V60 active-slot uniqueness와 create/revoke transaction은 이 transient adapter가 읽는 authoritative grant를
하나로 수렴시킨다. 최신 valid row 하나만 active slot을 보유하고, expiry/revoke는 slot을 비운 뒤 합성 권한을
즉시 잃게 한다.

## 근거

- Category는 운영 분석과 review에 필요한 최소 의미를 남기고 free text의 private-data 확산을 막는다.
- Request HMAC이 note 차이를 bind하므로 plaintext나 별도 note digest 없이 idempotency conflict를 판정한다.
- Immediate legacy redaction은 새 purge worker나 장기 민감 보존 예외를 만들지 않는다.
- 기존 request-local role synthesis를 보존해 membership을 만들지 않는 support read boundary를 유지한다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 평문 bounded note를 receipt/audit에 저장 | 길이 제한은 email, 이름, private content 유입을 막지 못한다. |
| Note를 별도 HMAC으로 저장 | Low-entropy note의 추측 비교 surface를 만들고 request HMAC과 중복된다. |
| Note를 암호화해 보존 | Retrieval authority, AEAD key rotation, nonce, retention/purge라는 새 민감 저장소를 만든다. |
| Legacy reason을 30일 보존 | 현재 필요한 retrieval 계약이 없는데 private plaintext와 purge operational debt를 연장한다. |
| Support용 membership을 생성 | Platform support authority와 club membership authority를 섞고 revoke/expiry 의미를 흐린다. |
| Synthetic `ROLE_HOST`를 제거 | 현재 host read path adapter를 깨뜨리며 이번 reason-minimization 결정의 범위를 벗어난다. |

## 결과

긍정적:
- 새 support command와 immutable evidence에 free-text private data가 남지 않는다.
- Legacy plaintext가 V60 이후 별도 retention 없이 redaction되고 compatibility column도 raw text를 받지 않는다.
- Current support read path는 유지되지만 persisted membership과 구분되는 authority contract가 명시된다.

부정적/감수한 비용:
- 운영자는 과거 또는 새 optional note의 원문을 audit에서 복구할 수 없다.
- Reason allowlist 변경은 canonical schema version과 client/server contract를 함께 바꿔야 한다.
- Active grant의 grantee UUID는 권한 판정을 위해 operational row가 존속하는 동안 유지된다.

## 검증

- Allowlist 밖 category와 case/Unicode 변형을 거절하고 whitespace-only note는 absent로 정규화하며 oversize note는
  거절한다. Note 유무·내용 변경이 request HMAC과 same-key conflict를 바꾸는지 test한다.
- Schema/row/DTO/audit/log/metric/query cache에 raw note, email, name과 reason metadata의 member identity가 없는지
  privacy test한다.
- V60 legacy upgrade가 모든 raw reason을 `LEGACY_UNCLASSIFIED + notePresent=true`로 수렴시키고 raw value를
  남기지 않으며 sentinel-only compatibility와 count-only migration evidence만 기록하는지 MySQL test한다.
- Create/revoke receipt replay가 현재 actor capability를 재검사하고 reason category·notePresent만 반환하는지
  test한다.
- Active `HOST_SUPPORT_READ` grant는 request-local `ROLE_HOST`를 합성하지만 membership row/normal membership
  DTO를 만들지 않고, wrong club/scope, expiry, revoke 뒤에는 합성하지 않는지 auth regression test한다.

## 후속 작업

- Review Workbenches Tasks 1–3가 V60 migration, support command contract, legacy redaction, transient authority
  regression과 browser privacy tests를 함께 구현한다.
- Code, migration, tests, active architecture와 retention/runbook이 이 계약과 일치한 뒤에만 `Accepted`로
  승격한다.
