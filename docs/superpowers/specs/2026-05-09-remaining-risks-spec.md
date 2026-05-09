# 남은 리스크 스팩: Legacy 제거 / IP Hash 환경변수 / BFF Multi-Secret Rotation

> 작성일: 2026-05-09
> 대상 버전: v1.5.2 이후
> 관련 plan: `docs/superpowers/plans/2026-05-09-remaining-risks-implementation-plan.md`

## 개요

현재 production 태그는 **v1.5.2**이며, Flyway migration `V24__legacy_password_hash_rename.sql`,
`V25__drop_legacy_password_hash.sql` 두 개는 main 브랜치에 머지되어 있으나 아직 production에는
배포되지 않은 상태이다. 본 스팩은 v1.5.2 이후 release 사이클에서 처리되어야 할 **세 가지 잔여
리스크**를 정의한다.

1. **SPEC-R-001 — Legacy password 완전 제거**
   - V24 + V25 동시 배포로 `legacy_password_hash`/`legacy_password_set_at` 컬럼을 제거하고,
     legacy password 경로의 dead code (PasswordResetController, SecurityConfig 내 관련 라우팅)를
     완전히 삭제한다.
2. **SPEC-R-002 — `READMATES_IP_HASH_BASE_SECRET` production 설정**
   - `ClientIpHashing`의 주간 salt rotation이 production에서 의미를 가지도록 OCI Compute에
     base secret 환경변수를 주입한다.
3. **SPEC-R-003 — BFF Multi-Secret Rotation**
   - SPEC-R-003a: `BffSecretFilter`가 단일 문자열이 아닌 secret 리스트를 수용하도록 리팩터하고
     (v1 TASK-071), Pages Functions BFF도 다중 secret 환경변수를 지원한다.
   - SPEC-R-003b: 어느 secret이 실제로 사용 중인지 회전 기간 동안 관찰 가능하도록 audit log
     테이블과 비동기 기록 경로를 추가한다 (v2 TASK-V2-029, SPEC-R-003a에 의존).

세 항목 모두 **이미 생산 코드 안에 흔적**이 남아 있다 (V24/V25 merge, ClientIpHashing 구현,
BffSecretFilter 단일 secret 구현). 본 스팩은 그 잔여 흔적들을 production-grade 상태로
끝맺는 것이 목적이다.

---

## SPEC-R-001: Legacy password column 및 dead code 제거

### 배경

ReadMates는 v1 단계에서 MySQL 기반 password 인증을 시범적으로 도입했다가, Cloudflare Pages SPA +
Google OAuth(BFF 위임)로 인증 모델을 전환했다. 그 결과 다음과 같은 잔재가 남았다.

- DB 측: `users.password_hash`, `users.password_set_at` 컬럼이 마지막 사용자 비밀번호 흔적과 함께
  존재.
- 코드 측: `PasswordResetController`가 410 GONE을 반환하는 stub으로만 남아 있음. `SecurityConfig`에
  관련 CSRF ignore 패턴 / permitAll 패턴이 그대로 등록되어 있음.

이미 main에는 두 단계 migration이 merge되어 있다.

```sql
-- V24__legacy_password_hash_rename.sql
alter table users
  change column password_hash legacy_password_hash varchar(255) null,
  change column password_set_at legacy_password_set_at datetime(6) null;
```

```sql
-- V25__drop_legacy_password_hash.sql
alter table users
  drop column legacy_password_hash,
  drop column legacy_password_set_at;
```

v2 plan(`docs/implementation-plan-v2.md`) 작성 시점의 가정은 "V24 → tag → V25 → tag" 두 release를
나눠 가는 것이었으나, 그 사이 production은 password 인증 경로 자체를 단 한 번도 사용하지 않은
사실이 확인되었다. 따라서 **legacy 호환을 더 유지할 이유가 없다**.

### 결정

**No legacy support.** V24 + V25를 단일 release에 동시 배포하고, 같은 PR/release에서 dead code도
제거한다. rollback이 필요하면 release tag 단위로 되돌린다 (V25 단독 down migration 작성하지 않음).

### 요구사항

1. **REQ-R-001-1**: `V24__legacy_password_hash_rename.sql`과 `V25__drop_legacy_password_hash.sql`이
   동일 production deploy에서 함께 적용되어야 한다. v1.5.2가 아닌 다음 release tag(v1.6.0 또는
   v1.5.3)에 두 migration이 함께 포함되어야 한다.
2. **REQ-R-001-2**: production 배포 후 `users` 테이블에는 `legacy_password_hash`,
   `legacy_password_set_at` 컬럼이 존재하지 않아야 한다.
3. **REQ-R-001-3**: `server/src/main/kotlin/com/readmates/auth/api/PasswordResetController.kt`
   파일은 삭제되어야 한다. 410 GONE을 반환하는 stub도 더 이상 필요하지 않다 (라우팅이 등록되지
   않으면 자동으로 404가 된다).
4. **REQ-R-001-4**: `SecurityConfig.kt`에서 다음 3개 라인이 제거되어야 한다.
   - `csrf { it.ignoringRequestMatchers(...)` 의 string matcher 블록 내
     `"/api/auth/password-reset/**"` 항목.
   - 동일 csrf 설정의 regex matcher 블록 내
     `methodAndPath("POST", Regex("^/api/host/members/[^/]+/password-reset$"))` 항목.
   - `authorizeHttpRequests { ... permitAll() }` 블록 내 `"/api/auth/password-reset/**"` 항목.
5. **REQ-R-001-5**: `password_hash`, `password_set_at`, `legacy_password_hash`,
   `legacy_password_set_at`, `password-reset` 문자열에 대해 production code(`server/src/main`,
   `front/src`, `front/functions`) 전체 grep 결과가 0건이어야 한다 (단, Flyway migration 자체와
   release notes 문서는 예외).
6. **REQ-R-001-6**: 본 task의 모든 변경은 단일 PR로 묶여야 한다. PR 제목은 release notes
   convention을 따르며 (`feat: drop legacy password column ...` 등), v1.5.x release notes에
   "Legacy password column removed"가 명시되어야 한다.

### 제약조건

- **CON-R-001-1**: down migration은 작성하지 않는다. rollback이 필요하면 docker image tag 단위로
  되돌리고, DB는 backup snapshot에서 복원한다.
- **CON-R-001-2**: V24와 V25를 별도 PR로 분리하지 않는다. 같은 PR / 같은 release에 포함한다.
- **CON-R-001-3**: 본 변경은 production에 deploy하기 전까지는 staging에서 V24+V25가 한 번에
  적용된 상태에서 회원가입/로그인/세션 흐름이 정상 동작함이 확인되어야 한다.
- **CON-R-001-4**: 데이터 마이그레이션은 없다. 컬럼은 그대로 drop된다 (사용되지 않은 데이터로
  확인됨).

### 검증 기준

1. **VER-R-001-1**: Flyway 적용 후 다음 SQL이 빈 결과를 반환해야 한다.
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'users'
     AND column_name IN ('password_hash','password_set_at',
                         'legacy_password_hash','legacy_password_set_at');
   ```
2. **VER-R-001-2**: `./server/gradlew -p server test` 전체 통과 (V24/V25 적용된 상태의 H2/MySQL
   testcontainer에서 모든 기존 테스트가 그대로 통과해야 한다).
3. **VER-R-001-3**: `./server/gradlew -p server test --tests 'com.readmates.architecture.*'`
   통과.
4. **VER-R-001-4**: `rg -n 'password_hash|password_set_at|password-reset' server/src/main
   front/src front/functions` 결과 0건.
5. **VER-R-001-5**: production 배포 후 다음 두 endpoint가 404를 반환해야 한다 (이전: 410 GONE).
   - `POST /api/auth/password-reset/{token}`
   - `POST /api/host/members/{membershipId}/password-reset`
6. **VER-R-001-6**: 회원가입 → invitation 수락 → Google OAuth login → session 생성/조회가 staging
   환경에서 end-to-end 통과해야 한다.

---

## SPEC-R-002: READMATES_IP_HASH_BASE_SECRET production 설정

### 배경

`ClientIpHashing.hashClientIp(raw, baseSecret, clock)`은 client IP를 `SHA-256(baseSecret::ISO년-Wweek::ip)`
의 앞 32자로 변환한다. 주간 ISO week을 salt에 포함시키는 이유는, **동일 IP가 여러 주에 걸쳐
다른 사용자/세션 활동을 했을 때 hash 값이 달라지도록 하여 cross-week linking을 방지**하기 위함이다.

```kotlin
// ClientIpHashing.kt
object ClientIpHashing {
    fun hashClientIp(raw: String?, baseSecret: String, clock: Clock = Clock.systemUTC()): String {
        val ip = raw?.takeIf { it.isNotBlank() } ?: return "anonymous"
        val week = ZonedDateTime.now(clock).get(WeekFields.ISO.weekOfWeekBasedYear())
        val year = ZonedDateTime.now(clock).get(WeekFields.ISO.weekBasedYear())
        val salt = "${baseSecret}::${year}-W${week}"
        return MessageDigest.getInstance("SHA-256")
            .digest("$salt::$ip".toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
            .take(32)
    }
}
```

`RateLimitFilter`는 다음과 같이 base secret을 주입받는다.

```kotlin
@Value("\${READMATES_IP_HASH_BASE_SECRET:}")
private val ipHashBaseSecret: String = ""
```

### 문제

production OCI Compute 환경의 `compose.yml` / `.env`에는 `READMATES_IP_HASH_BASE_SECRET`이 설정되어
있지 않다. 그 결과 `ipHashBaseSecret = ""`이 되고, salt는 `"::2026-W19"` 형태로 base secret 부분이
빈 문자열이 된다. 이 상태에서도 hash는 계산되고 rate limit 자체는 동작하지만, **salt가 사실상
공개 가능한 값(year-week)밖에 없어 cross-week linking 방지 효과가 사라진다**. 추가로, attacker가
ISO week 정보만 알면 임의 IP에 대해 hash를 reproduce할 수 있다.

### 요구사항

1. **REQ-R-002-1**: production OCI Compute 인스턴스의 `.env` 파일에 다음과 같은 환경변수가
   추가되어야 한다.
   ```
   READMATES_IP_HASH_BASE_SECRET=<32바이트 이상 base64 또는 hex 문자열>
   ```
   값은 `openssl rand -base64 32` 또는 `openssl rand -hex 32`로 생성한다.
2. **REQ-R-002-2**: `compose.yml`의 Spring Boot 서비스 `environment:` 섹션에서
   `READMATES_IP_HASH_BASE_SECRET`이 `${READMATES_IP_HASH_BASE_SECRET}` 또는 `env_file`을 통해
   container에 전달되어야 한다.
3. **REQ-R-002-3**: 환경변수는 **manual rotation 대상이 아니다**. 한 번 생성한 뒤 변경하지 않는다
   (회전은 ISO week 단위로 자동 발생). 다만 secret leak이 의심될 경우에는 즉시 새 값으로
   교체하고, 그 시점부터 7일 동안의 rate limit bucket은 fresh start된다.
4. **REQ-R-002-4**: production `.env`의 본 환경변수 값은 GitHub repo / Cloudflare Pages env / 평문
   문서 어디에도 commit되지 않아야 한다.
5. **REQ-R-002-5**: 본 환경변수 누락은 startup-time error가 아니라 silent fallback이다 (현재 구현
   유지). 단, `RateLimitFilter` 또는 startup log에서 base secret 미설정 상태가 한 번 WARN으로
   기록되어야 한다 (선택 강화 항목, REQ-R-002-5-bis).

### 제약조건

- **CON-R-002-1**: 본 task는 **인프라 변경 only**이다. application 코드 (`ClientIpHashing.kt`,
  `RateLimitFilter.kt`)는 수정하지 않는다 (선택 강화 REQ-R-002-5-bis 제외).
- **CON-R-002-2**: secret 값은 OCI 인스턴스에 SSH 접근 가능한 운영자만 알 수 있도록 한다. 1Password
  team vault 또는 별도의 secret manager에 등록한다.
- **CON-R-002-3**: docker container restart 외의 다운타임은 허용되지 않는다 (Spring Boot 단일
  인스턴스 graceful restart로 충분).

### 검증 기준

1. **VER-R-002-1**: production 배포 후 OCI Compute에서
   `docker exec <spring-container> printenv READMATES_IP_HASH_BASE_SECRET` 가 비어 있지 않은 값을
   출력해야 한다.
2. **VER-R-002-2**: Spring Boot startup log에 `RateLimitFilter` 초기화 메시지가 정상 출력되며,
   "READMATES_IP_HASH_BASE_SECRET is empty" 종류의 WARN이 발생하지 않아야 한다.
3. **VER-R-002-3**: `ClientIpHashingTest`가 `./server/gradlew -p server test
   --tests 'com.readmates.shared.security.ClientIpHashingTest'`로 통과한다.
4. **VER-R-002-4**: 동일 IP에 대해 2주 간격으로 rate limit hit 시, audit log 또는 metric의 hash
   값이 서로 달라야 한다 (수동 검증, 또는 ISO week을 fixed clock으로 단위 테스트).

---

## SPEC-R-003: BFF Multi-Secret Rotation

### 배경

현재 BFF (Cloudflare Pages Functions) → Spring server 간에는 단일 shared secret
(`X-Readmates-Bff-Secret` header)로 reverse-proxy 인증이 이뤄지고 있다.

```kotlin
@Component
class BffSecretFilter(
    @param:Value("\${readmates.bff-secret:}")
    private val expectedSecret: String,
    private val allowedOriginPort: AllowedOriginPort,
    @param:Value("\${readmates.bff-secret-required:true}")
    private val bffSecretRequired: Boolean,
) : OncePerRequestFilter() {
    init {
        if (bffSecretRequired && expectedSecret.trim().isBlank()) {
            throw IllegalStateException("readmates.bff-secret must be configured ...")
        }
    }
    // ...
}
```

```yaml
readmates:
  bff-secret-required: ${READMATES_BFF_SECRET_REQUIRED:true}
  # bff-secret: ${READMATES_BFF_SECRET:}
```

```typescript
// front/functions/api/_shared/proxy.ts
export function bffSecretFromEnv(env: { READMATES_BFF_SECRET?: string }) {
  const directSecret = env.READMATES_BFF_SECRET?.trim();
  if (directSecret) return directSecret;
  return null;
}
```

이 단일 secret 모델은 회전 시 zero-downtime이 불가능하다. (BFF env 갱신과 server env 갱신 사이에
반드시 inconsistent window가 생김.) v1 plan TASK-071 / v2 plan TASK-V2-029가 같은 문제를 인식하고
있었지만, v1 TASK-071이 main에 merge되지 못해 v2 TASK-V2-029도 SKIP 상태이다.

본 스팩은 v1 TASK-071의 승계자(SPEC-R-003a)와 그에 의존하는 v2 TASK-V2-029의 승계자(SPEC-R-003b)를
정의한다.

### SPEC-R-003a: BffSecretFilter 다중 secret 지원 (v1 TASK-071 승계)

#### 요구사항

1. **REQ-R-003a-1**: 신규 application property `readmates.security.bff.secrets`을 도입한다. 환경변수
   바인딩은 `${READMATES_BFF_SECRETS:}` 이며, comma로 구분된 여러 값을 받는다.
   ```yaml
   readmates:
     security:
       bff:
         secrets: ${READMATES_BFF_SECRETS:}
   ```
2. **REQ-R-003a-2**: `BffSecretFilter` constructor 시그니처는 `expectedSecret: String`을
   `secrets: List<String>`으로 교체한다. Spring 의 `@Value` SpEL을 사용해 comma 분리 + trim + blank
   제거를 수행한다.
   ```kotlin
   @param:Value("#{'\${readmates.security.bff.secrets:}'.split(',')}")
   private val configuredSecrets: List<String>,
   @param:Value("\${readmates.bff-secret:}")
   private val legacyExpectedSecret: String, // backward compat
   ```
   filter 내부에서 두 source를 병합한 `secrets: List<String>`을 만들고, 모든 후속 로직은 이
   리스트에 대해서만 작동한다.
3. **REQ-R-003a-3**: `init` 블록은 `bffSecretRequired=true`일 때 병합된 `secrets`이 비어 있으면
   `IllegalStateException`을 던진다. 메시지는
   `"readmates.security.bff.secrets must contain at least one entry when readmates.bff-secret-required is true"`이다.
4. **REQ-R-003a-4**: secret 매칭 로직은 timing-safe loop이어야 한다. 즉,
   `secrets.any { MessageDigest.isEqual(it.toByteArray(UTF_8), provided.toByteArray(UTF_8)) }`
   형태로 모든 entry를 일정 시간으로 비교한다. (early-return은 허용; 문자열 길이가 다르면
   `MessageDigest.isEqual`은 false를 반환하지만 두 입력은 timing-safe하게 비교됨.)
5. **REQ-R-003a-5**: `front/functions/api/_shared/proxy.ts`의 `bffSecretFromEnv`는 다음 우선순위로
   값을 반환한다.
   1. `env.READMATES_BFF_SECRETS`가 set이고 trim 후 non-empty이면, comma split 후 첫 번째 non-blank
      entry를 반환.
   2. (1)이 없으면 기존 `env.READMATES_BFF_SECRET`을 trim 후 반환 (backward compat).
   3. 둘 다 없으면 null.
6. **REQ-R-003a-6**: `front/functions/api/bff/[[path]].ts`의 `Env` type 정의에
   `READMATES_BFF_SECRETS?: string`을 추가한다.
7. **REQ-R-003a-7**: `proxy.ts`의 `forwardedOAuthRequestHeaders`(또는 동일 역할의 다른 helper)도
   `bffSecretFromEnv`를 통해 secret을 얻어야 한다. 직접 `env.READMATES_BFF_SECRET`을 읽는 코드가
   없어야 한다 (single source of truth).
8. **REQ-R-003a-8**: 기존 server 측 `BffSecretFilter` 관련 테스트 3종은 multi-secret 시그니처에
   맞춰 갱신되어야 한다.
   - `BffSecretFilterTest.kt`
   - `BffSecretFilterUnitTest.kt`
   - `BffSecretFilterDynamicOriginTest.kt`
9. **REQ-R-003a-9**: 새로 작성되는 테스트는 다음 시나리오를 반드시 포함한다.
   - 두 개의 secret이 설정된 상태에서, 각각의 secret으로 인증 시 200.
   - 등록되지 않은 임의 secret으로 인증 시 401.
   - secrets list가 빈 상태이고 `bff-secret-required=false`이면 모든 요청 통과.
   - secrets list가 빈 상태이고 `bff-secret-required=true`이면 startup 실패
     (`IllegalStateException`).
   - legacy `readmates.bff-secret` 단일 값만 설정된 backward-compat 케이스에서 200.

#### 제약조건

- **CON-R-003a-1**: API 라우트, 응답 JSON shape, 401 메시지 본문은 변경하지 않는다.
- **CON-R-003a-2**: backward compatibility를 유지하기 위해 `READMATES_BFF_SECRET` env 단일 값만
  설정된 기존 production 환경도 정상 동작해야 한다 (배포 순서 자유도 확보).
- **CON-R-003a-3**: secret 비교는 `String.equals` 또는 `==`로 수행되지 않는다 (timing attack
  방지).
- **CON-R-003a-4**: comma 분리 시 빈 entry / 공백 entry는 자동으로 무시되어야 한다
  (예: `,a,,b,` → `["a","b"]`).
- **CON-R-003a-5**: secret 값에 comma가 포함되지 않아야 한다 (운영 가이드에 명시).

#### 검증 기준

1. **VER-R-003a-1**: `./server/gradlew -p server test
   --tests 'com.readmates.security.BffSecretFilter*'` 모든 테스트 통과.
2. **VER-R-003a-2**: `cd front && pnpm typecheck` 통과 (`Env` type 추가에 따른 컴파일 오류 없음).
3. **VER-R-003a-3**: staging에서 두 secret을 등록한 상태로 `secret1` 또는 `secret2` header로 호출
   시 모두 200, 임의 값으로 호출 시 401.
4. **VER-R-003a-4**: 회전 drill (`secret1` → `secret1,secret2` → `secret2,secret1` → `secret2`)을
   staging에서 한 번 실행하여 401이 한 건도 발생하지 않음을 확인한다.

### SPEC-R-003b: BFF rotation audit log (v2 TASK-V2-029 승계, SPEC-R-003a에 의존)

#### 요구사항

1. **REQ-R-003b-1**: Flyway migration `V26__bff_secret_rotation_audit.sql`를 추가한다.
   ```sql
   create table bff_secret_rotation_audit (
     id bigint unsigned not null auto_increment primary key,
     secret_alias varchar(64) not null,
     used_at datetime(6) not null,
     client_ip_hash char(64),
     request_path varchar(255),
     index bff_secret_rotation_audit_alias_used_at_idx (secret_alias, used_at)
   );
   ```
2. **REQ-R-003b-2**: `secret_alias`는 매칭된 secret이 secrets list 내에서 차지하는 역할을 식별한다.
   기본 정책은 다음과 같다.
   - 첫 번째 entry: `"primary"`
   - 두 번째 entry: `"secondary"`
   - 그 이후: `"index_${i}"` (i는 0-based)
   운영 회전 단계에서는 두 entry까지만 사용하도록 권장한다.
3. **REQ-R-003b-3**: 신규 outbound port 인터페이스 `BffSecretRotationAuditPort`를 도입한다.
   ```kotlin
   interface BffSecretRotationAuditPort {
       fun recordUsage(secretAlias: String, clientIpHash: String?, requestPath: String?)
   }
   ```
   패키지 위치는 `com.readmates.security.application.port.out` (또는 기존 security application
   layer의 port 패키지). port의 위치는 ServerArchitectureBoundaryTest 통과를 만족하는 한 자유.
4. **REQ-R-003b-4**: `JdbcBffSecretRotationAuditAdapter`(`@Component`)가
   `BffSecretRotationAuditPort`를 구현하며, `JdbcTemplate.update`로 한 row insert한다.
5. **REQ-R-003b-5**: `BffSecretFilter`는 `BffSecretRotationAuditPort?`를 optional inject 한다
   (`@Autowired(required=false)`). secret match 성공 직후 비동기로 `recordUsage(...)`를 호출한다.
   - 비동기 실행은 `@Async` + `@EnableAsync` 또는 `CompletableFuture.runAsync(executor)` 형태로
     구현한다.
   - audit insert 실패는 request 응답에 영향을 주지 않아야 한다 (catch + log only).
6. **REQ-R-003b-6**: `client_ip_hash`는 SPEC-R-002의 `ClientIpHashing.hashClientIp(raw,
   baseSecret)` 결과를 사용한다 (32 hex chars). NULL을 허용한다.
7. **REQ-R-003b-7**: `request_path`는 `request.requestURI`에서 query string을 제거한 값으로 최대
   255자까지 잘라서 기록한다.
8. **REQ-R-003b-8**: 회전 procedure가 운영 문서 `docs/deploy/oci-backend.md`에 추가되어야 한다.
   본 문서가 정의하는 회전 단계는:
   1. 새 secret 생성: `openssl rand -base64 32`.
   2. Cloudflare Pages env: `READMATES_BFF_SECRETS`에 두 번째 entry로 추가.
   3. Server env: `READMATES_BFF_SECRETS`에 동일 값을 추가, container restart.
   4. audit query로 traffic 분포 확인:
      ```sql
      SELECT secret_alias, COUNT(*) FROM bff_secret_rotation_audit
      WHERE used_at > NOW() - INTERVAL 1 HOUR
      GROUP BY secret_alias;
      ```
   5. `primary` count가 0이 되면 BFF env에서 `secondary,primary` 순서로 swap.
   6. 추가 monitoring window (>= 1시간) 후, 양쪽 env에서 old secret entry 제거.

#### 제약조건

- **CON-R-003b-1**: audit insert가 request critical path를 막지 않아야 한다. 동기 insert는 금지.
- **CON-R-003b-2**: `bff_secret_rotation_audit` 테이블에는 retention 정책이 필요하다 (예: 90일
  이전 row 자동 삭제). 본 스팩은 retention 자동화를 요구하지 않으나, 운영 가이드에
  "주기적으로 truncate / archive"를 명시한다.
- **CON-R-003b-3**: secret 값 자체는 절대 audit log에 기록되지 않아야 한다. `secret_alias`만 기록한다.
- **CON-R-003b-4**: SPEC-R-003a가 먼저 production에 배포되지 않은 상태에서 SPEC-R-003b만 배포되어선
  안 된다 (multi-secret 개념이 없으면 audit이 의미가 없음).

#### 검증 기준

1. **VER-R-003b-1**: V26 migration 적용 후
   ```sql
   SHOW CREATE TABLE bff_secret_rotation_audit;
   ```
   가 `bff_secret_rotation_audit_alias_used_at_idx` index를 포함해야 한다.
2. **VER-R-003b-2**: `BffSecretFilter`에 audit port mock을 주입한 단위 테스트에서, 정상 secret
   매칭 시 `recordUsage`가 정확히 1회 호출됨을 verify한다.
3. **VER-R-003b-3**: 동일 단위 테스트에서, `recordUsage`가 RuntimeException을 던져도 filter는
   `200` 또는 down-stream 응답을 그대로 반환해야 한다.
4. **VER-R-003b-4**: staging 회전 drill에서 위 SQL 분포 query가 `primary` → `primary+secondary`
   → `secondary` 순으로 비율 변화함을 확인한다.

---

## 의존성 순서

1. **SPEC-R-001** (legacy password 제거): 다른 항목과 독립. v1.5.x release tag 단위로 즉시 진행
   가능. V24 + V25 동시 배포가 전제.
2. **SPEC-R-002** (IP hash base secret): SPEC-R-001과 독립. 단, SPEC-R-003b의 `client_ip_hash` 품질이
   본 항목 완료에 의존하므로 SPEC-R-003b 이전에 완료되어야 한다.
3. **SPEC-R-003a** (BFF multi-secret): SPEC-R-001/SPEC-R-002와 독립.
4. **SPEC-R-003b** (rotation audit log): **SPEC-R-003a 완료 후**에만 진행 가능. 또한
   `client_ip_hash` 품질을 위해 **SPEC-R-002 완료 후** 진행을 권장.

권장 release 순서:

```
release N   → SPEC-R-001 (V24+V25, legacy code removal)
release N   → SPEC-R-002 (인프라 only, code 변경 없음 — 같은 release에 묶을 수 있음)
release N+1 → SPEC-R-003a (multi-secret 지원)
release N+2 → SPEC-R-003b (audit log + 회전 drill 문서화)
```

`release N`에 SPEC-R-001과 SPEC-R-002를 함께 묶는 것은 SPEC-R-002가 application 코드를 변경하지
않고 인프라 환경변수만 추가하기 때문에 충돌 위험이 없기 때문이다. 단, SPEC-R-002의 `.env` 갱신은
SPEC-R-001 코드와 같은 deploy step에서 수행되어야 회전 drill의 audit hash가 의미를 가진다.
