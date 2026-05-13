# ADR-0005: BFF shared secret + multi-secret rotation

- 상태: Accepted
- 결정일: 2026-05-09
- 작성자: 보안/인프라
- 관련: ADR-0001 (BFF), ADR-0006 (session cookie), ADR-0014 (BFF secret rotation lifecycle),
  `front/functions/_shared/proxy.ts`,
  `server/src/main/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilter.kt`,
  `server/src/main/resources/application.yml`,
  `server/src/main/resources/db/mysql/migration/V26__bff_secret_rotation_audit.sql`,
  `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcBffSecretRotationAuditAdapter.kt`

## 컨텍스트

BFF(Cloudflare Pages Functions)와 Spring API 서버 사이의 신뢰 검증은 shared secret으로 구현된다. BFF가 Spring에 요청할 때 `X-Readmates-Bff-Secret` 헤더에 secret 값을 포함하고, Spring의 `BffSecretFilter`가 이를 검증한다.

### 초기 구현의 한계 (v1.5.x까지)

단일 `READMATES_BFF_SECRET` 환경 변수만 사용했다. 단일 secret 방식은 다음 운영 문제를 가진다:

**문제 1: 회전 시 순간적 다운타임**

secret을 새 값으로 바꾸려면 Cloudflare Pages와 Spring 서버 양쪽의 환경 변수를 동시에 갱신해야 한다. 그러나:
- Cloudflare Pages 환경 변수 갱신 → Pages Functions 재배포 (수십 초)
- Spring 서버 환경 변수 갱신 → 서버 재시작 (수십 초)

이 두 작업이 원자적으로 발생하지 않는다. 교체 중 짧은 시간에 한쪽은 구 secret, 다른 쪽은 새 secret을 갖게 되어 모든 API 요청이 401로 실패한다. 이 다운타임은 피크 시간대에는 특히 부담이 된다.

**문제 2: 노출 의심 시 즉각 대응 불가**

secret 노출이 의심되는 경우(예: 로그에서 secret 패턴이 발견되거나 내부 보안 인시던트 발생 시), 즉시 무효화하고 새 값으로 교체해야 한다. 단일 secret 방식에서는 새 값으로 교체하는 순간 트래픽이 끊긴다. "먼저 Spring에 새 값을 추가"하는 방법이 없다.

**문제 3: 회전 이력 부재**

언제, 왜, 누가 secret을 바꿨는지 기록이 없다. audit/compliance 요구사항을 충족하기 어렵다. 보안 이슈 발생 시 "마지막 회전이 언제였는가"를 알 수 없다.

### v1.6.0에서의 변경

`V26__bff_secret_rotation_audit.sql`이 추가되면서 multi-secret rotation 방식으로 전환됐다. Cloudflare Pages 환경 변수와 Spring 설정 양쪽이 두 knob을 지원하도록 변경됐다.

## 결정

두 환경 변수를 동시에 지원하는 방식으로 BFF secret을 관리한다:

### Cloudflare Pages 측 (`front/functions/_shared/proxy.ts`)

두 환경 변수를 읽는다:
- `READMATES_BFF_SECRETS` (rotation candidates, comma-separated): `proxy.ts:57`
- `READMATES_BFF_SECRET` (legacy primary): `proxy.ts:58`

로직 (`proxy.ts:60`, `proxy.ts:68`):
1. `READMATES_BFF_SECRETS`가 설정되어 있으면, 첫 번째 값을 사용한다 (현재 primary).
2. `READMATES_BFF_SECRETS`가 없으면, `READMATES_BFF_SECRET` (legacy)을 사용한다.

### Spring 서버 측 (`server/src/main/resources/application.yml`)

```yaml
readmates:
  bff-secret: ${READMATES_BFF_SECRET:}        # line 46 — legacy primary
  bff-secret-required: ${READMATES_BFF_SECRET_REQUIRED:true}  # line 47
  security:
    bff:
      secrets: ${READMATES_BFF_SECRETS:}      # line 50 — rotation candidates list
```

`BffSecretFilter.kt:22-24`에서 두 값을 읽는다:
```kotlin
@param:Value("\${readmates.security.bff.secrets:}")
private val configuredSecretsRaw: String,    // BffSecretFilter.kt:22

@param:Value("\${readmates.bff-secret:}")
private val legacyExpectedSecret: String,    // BffSecretFilter.kt:24
```

`BffSecretFilter.kt:34-44`에서 두 값을 합쳐 허용 secret list를 만든다. `READMATES_BFF_SECRETS`에 값이 있으면 그 list만 사용하고, 없을 때만 `READMATES_BFF_SECRET` (legacy)을 fallback으로 사용한다:

```kotlin
private val secrets: List<String> = run {
    val fromList = configuredSecretsRaw.split(',').map { it.trim() }.filter { it.isNotBlank() }
    val fromLegacy = legacyExpectedSecret.trim().takeIf { it.isNotBlank() }?.let { listOf(it) } ?: emptyList()
    if (fromList.isNotEmpty()) fromList else fromLegacy
}
```

들어오는 요청의 `X-Readmates-Bff-Secret` 헤더가 list의 어느 값과 일치해도 허용된다.

**Timing-safe 비교**: secret 비교는 `SecretComparator.firstMatchingIndex()`에서 `MessageDigest.isEqual()`로 처리된다. 모든 candidate를 순회(early return 없음)해 timing attack과 index 위치 노출을 줄이고, `BffSecretFilter`와 `RateLimitFilter`가 같은 comparator를 사용한다:

```kotlin
var matched = -1
candidates.forEachIndexed { idx, candidate ->
    if (MessageDigest.isEqual(provided, candidate)) {
        matched = idx
    }
}
return matched
```

**Alias 추적**: `BffSecretFilter.aliasFor()`에서 일치하는 secret의 index를 `"primary"`, `"secondary"`, `"index_N"` alias로 변환한다. audit 기록에 어느 secret이 사용됐는지 기록할 때 raw secret 값 대신 alias를 저장한다.

**Origin/Referer 이중 방어**: `BffSecretFilter.kt:75`에서 mutating request 진입을 차단하고, `:130-136`의 `hasAllowedOrigin()`이 `Origin` 또는 `Referer` 헤더를 허용 목록에서 확인한다. BFF secret 검증 외에도 이중으로 검사한다. BFF secret이 노출된 상태에서도 cross-site mutation을 차단한다.

**bff-secret-required 설정**: `BffSecretFilter.kt:47-53`에서 `bffSecretRequired=true`(기본값)이면 secrets가 비어있을 때 startup 시 `IllegalStateException`으로 실패한다. 로컬 개발에서만 `READMATES_BFF_SECRET_REQUIRED=false`로 설정해 비밀번호 없이 개발한다.

### 무중단 회전 절차 (4단계)

1. **Spring에 새 secret 추가**: `READMATES_BFF_SECRETS`에 새 secret 값을 추가한다. 재시작 후 Spring이 구 secret과 새 secret 모두 허용한다. 트래픽 정상 유지.

2. **BFF를 새 secret으로 rollout**: BFF의 `READMATES_BFF_SECRETS`에 새 secret 값을 첫 번째로 추가한다. Cloudflare Pages 재배포 후 BFF가 새 secret으로 전송하기 시작한다. Spring이 두 secret을 모두 허용하므로 트래픽 정상.

3. **Legacy primary 갱신**: `READMATES_BFF_SECRET`을 새 값으로 갱신한다. (선택적 — rotation candidates가 있으면 이 값은 사용되지 않음)

4. **구 secret 제거**: Spring에서 `READMATES_BFF_SECRETS`에서 구 secret을 제거한다. 재시작 후 구 secret이 더 이상 허용되지 않는다.

### Rotation audit

성공한 BFF secret 요청은 `readmates.security.bff.audit-mode` 설정에 따라 `bff_secret_rotation_audit` 테이블에 row로 기록된다:
- `V26__bff_secret_rotation_audit.sql` — 테이블 생성
- `JdbcBffSecretRotationAuditAdapter.kt:24` — audit row 삽입

기본값 `rotation-only`는 회전 확인에 필요한 non-primary alias(`secondary`, `index_N`) 사용만 기록한다. `all`은 짧은 incident window에서 모든 성공 요청을 기록하고, `off`는 audit table이나 DB 압박 상황에서 임시로 기록을 끈다.

## 근거

### 무중단 회전

단계별 절차를 통해 Spring이 항상 현재 유효한 secret을 허용하는 상태를 유지한다. BFF와 Spring이 동시에 재시작되지 않아도 된다. 각 단계 사이에 모든 요청이 정상 처리된다. 위 4단계 절차를 전부 완료하는 데 걸리는 시간 동안 트래픽이 중단되지 않는다.

### 분 단위 대응

secret 노출이 의심될 때:
1. 즉시 새 secret을 Spring `READMATES_BFF_SECRETS`에 추가 (재시작, ~30초)
2. BFF를 새 secret으로 rollout (Cloudflare Pages 배포, ~1분)
3. Spring에서 구 secret 제거 (재시작, ~30초)

전 과정이 2-3분 이내에 완료 가능하다. 구 secret이 노출된 시점부터 무효화까지 최소 시간을 보장한다.

### Audit trail

`bff_secret_rotation_audit` 테이블에는 raw secret 대신 alias, 사용 시각, client IP hash, 요청 path가 기록된다. 기본 `rotation-only` 모드에서는 primary 요청이 쌓이지 않으므로 평상시 DB 적재량을 낮추면서도 old-secret alias 트래픽이 남았는지 확인할 수 있다.

### 단순한 구현

mTLS나 JWT/asymmetric key 방식은 인증서 관리, KMS 의존, 인증서 rotation 자동화 등 추가 인프라가 필요하다. Shared secret 방식은 환경 변수 2개와 list 비교만으로 구현된다. ReadMates 규모에서는 이 단순함이 적절하다. 구현 복잡도가 낮아 실수의 여지도 적다.

### Rolling update 호환

Spring이 여러 secret을 동시에 허용하므로, Kubernetes 또는 Docker Swarm의 rolling update 중에 구/신 BFF 인스턴스가 혼재해도 모두 처리된다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| 단일 secret + maintenance window | 회전 시 API 전체가 짧게 중단된다. 예측 가능한 중단이라도 invite-only 서비스에서는 사용자 경험에 직접 영향을 주며 신뢰도 손상이 있다. 새벽 2시에 maintenance window를 잡는 운영 부담도 있다. |
| mTLS (mutual TLS) | Cloudflare Pages Functions에서 mTLS client certificate를 관리하는 것이 번거롭다. 인증서 만료/회전이 추가 운영 부담이다. Cloudflare와 OCI 양쪽에서 PKI 인프라가 필요하다. |
| JWT signed by Cloudflare Worker | BFF가 asymmetric key로 JWT를 서명하면 무결성 검증이 가능하다. 단, key 관리(KMS 또는 환경 변수에 key), JWT 파싱 라이브러리, 만료 처리, clock skew 대응이 모두 추가로 필요하다. 현재 신뢰 모델에서는 과잉이다. |
| IP allowlist만으로 신뢰 | Cloudflare egress IP 범위는 공개되어 있고 고정되지 않는다. IP allowlist 유지가 번거롭고, Cloudflare 인프라를 공유하는 다른 tenant가 같은 IP를 사용할 수 있다. |
| Authorization: Bearer token | 기능적으로 동일하지만 `X-Readmates-Bff-Secret`이라는 명시적 커스텀 헤더가 용도를 더 명확히 표현한다. Spring Security의 Bearer token 인증 필터와 의도치 않게 상호작용하지 않는다. |

## 결과

긍정적:
- 무중단 secret 회전이 가능하다. 트래픽 중단 없이 secret을 교체할 수 있다.
- 기본 audit mode에서 non-primary alias 사용이 `bff_secret_rotation_audit` 테이블에 보존되어 회전 완료 여부를 확인할 수 있다.
- 보안 인시던트 발생 시 분 단위 대응이 가능하다.
- Spring이 여러 secret을 동시에 허용하므로, rolling update 중에도 모든 요청이 처리된다.
- 구현이 단순해 실수의 여지가 적다.

부정적/감수한 비용:
- Cloudflare Pages와 Spring 서버 양쪽의 환경 변수를 동기화할 책임이 운영자에게 있다. 동기화 오류 발생 시 트래픽이 차단된다.
- 4단계 회전 절차 runbook이 필요하다. 문서화되지 않으면 운영자가 절차를 실수할 수 있다.
- 기본 `rotation-only` audit mode는 primary alias 요청을 기록하지 않는다. 전체 요청 감사가 필요한 짧은 incident window에서는 `READMATES_SECURITY_BFF_AUDIT_MODE=all`을 명시해야 한다.
- `READMATES_BFF_SECRETS`가 여러 값을 포함할 때 어느 값이 "현재 primary"인지 운영자가 확인해야 한다. ADR-0014의 `GET /api/bff/__internal/secret-status` 진단 route는 count, stage, primary fingerprint만 노출해 raw secret 없이 상태를 확인한다.
- 두 환경 변수의 의미와 관계를 이해하지 못한 운영자가 잘못 설정하면 보안 취약점이 생길 수 있다.

## 검증

BFF secret 처리 통합 테스트:
```bash
./server/gradlew -p server test --tests "*BffSecret*"
```

수동 인수 테스트:
- valid secret 헤더로 Spring API 호출 → 200 응답 확인
- invalid secret 헤더로 Spring API 호출 → 401 응답 확인
- `READMATES_BFF_SECRETS`에 두 값이 있을 때 각각으로 요청 → 모두 200 응답 확인

rotation audit 검증:
- 기본 `rotation-only`에서는 secondary/index alias 사용만 `bff_secret_rotation_audit`에 기록되는지 확인
- `READMATES_SECURITY_BFF_AUDIT_MODE=all`에서는 primary 포함 모든 성공 요청이 기록되는지 확인

public release 검증:
- ADR 및 문서에 실제 secret 값이 포함되지 않는지 확인: `./scripts/public-release-check.sh`

## 후속 작업

- secret rotation runbook 고도화: `docs/deploy/oci-backend.md`와 `docs/deploy/security-public-repo.md`의 절차를 기준으로 rollback, incident window, `audit-mode=all` 사용 시점을 더 명확히 한다.
- 자동 회전(90일 주기) 도입 검토: GitHub Actions scheduled workflow가 새 secret 생성 → 양쪽 환경 변수 갱신 → audit row 삽입을 자동화.
- 현재 유효 secret 상태 노출은 ADR-0014의 `GET /api/bff/__internal/secret-status`로 1차 해결됐다. 후속으로 동일 정보를 운영 dashboard에 연결할 수 있다.
- Spring `bff-secret-required=false` 설정의 사용 케이스와 허용 환경 명확화 (로컬 dev에서 항상 false 허용인지).
- `READMATES_BFF_SECRETS` 최대 허용 개수 정책: 현재 무제한 candidate를 허용한다. 실수로 오래된 secret을 제거하지 않으면 계속 쌓인다. "rotation 완료 후 2개 초과는 경고" 같은 정책 및 startup 시 개수 확인 로직 검토.
- BFF secret alias 활용 확장: alias(`primary`, `secondary`, `index_N`)가 현재 audit 기록에만 쓰인다. low-cardinality 메트릭으로 확장하면 회전 완료 여부를 DB 조회 없이 모니터링할 수 있다.
- BFF secret 만료 알림: 현재 secret rotation이 수동이다. `bff_secret_rotation_audit`에서 "마지막 rotation이 90일 이상 지났으면 알림" 같은 scheduled check를 GitHub Actions로 자동화 검토.
