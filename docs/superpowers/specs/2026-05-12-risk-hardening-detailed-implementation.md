# 리스크 하드닝 상세 구현 문서

작성일: 2026-05-12
상태: 구현 대기
연결 플랜: `docs/superpowers/plans/2026-05-12-risk-hardening-implementation-plan.md`

## 목표

프로젝트 전체 점검에서 확인한 상위 리스크 4개를 기존 ReadMates 아키텍처 안에서 닫는다. 이 문서는 실제 구현자가 코드 변경 전에 읽는 상세 설계 문서이며, 현재 동작을 사실로 기록하고 변경 후 기대 동작, 테스트 기준, 운영 확인 기준을 고정한다.

## 범위

| ID | 리스크 | 주요 표면 | 완료 결과 |
| --- | --- | --- | --- |
| RISK-H-001 | BFF 다중 시크릿과 rate limit 신뢰 판단 불일치 | `server/src/main/kotlin/com/readmates/auth/infrastructure/security` | `RateLimitFilter`가 `BffSecretFilter`와 같은 시크릿 우선순위를 사용한다. |
| RISK-H-002 | BFF 시크릿 감사 로그가 모든 인증 요청마다 적재됨 | `BffSecretFilter`, 감사 포트, 운영 문서 | 기본 감사 모드를 rotation-only로 줄이고 bounded executor로 비동기 압력을 제한한다. |
| RISK-H-003 | public release 후보에 프론트 테스트 산출물이 포함될 수 있음 | `scripts/build-public-release-candidate.sh`, `scripts/public-release-check.sh`, fixture 검증 | `front/test-results`, `front/playwright-report`, `front/coverage` 계열 산출물이 후보 생성과 검사 양쪽에서 차단된다. |
| RISK-H-004 | persistence adapter가 Spring Web 예외를 직접 던짐 | club platform admin server slice | HTTP 예외는 inbound web adapter에서만 다루고 persistence adapter는 port 결과만 반환한다. |

## 범위 밖

- 실제 운영 설정값, 배포 상태, 개인 로컬 경로, 실사용 멤버 데이터, 실제 도메인, 실제 시크릿 값은 문서와 테스트에 넣지 않는다.
- 인증 정책 자체를 재설계하지 않는다. BFF 시크릿 검증과 기존 origin 검증 의미는 유지한다.
- DB 스키마를 새로 추가하지 않는다. `bff_secret_rotation_audit` 테이블은 이미 존재하는 저장소로 취급한다.
- public release 산출물 차단 대상은 이번 리스크에서 확인한 프론트 생성 산출물에 한정한다.

## 공통 원칙

- 서버 코드는 `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence` 경계를 따른다.
- 브라우저로 노출되는 값에 BFF 시크릿이나 서버 전용 설정을 추가하지 않는다.
- 테스트는 실패 재현을 먼저 추가하고, 최소 구현으로 통과시킨다.
- release 후보 생성 스크립트와 release 검사 스크립트는 같은 forbidden path 정책을 공유하도록 맞춘다.
- 문서는 Korean-first 스타일을 유지하고 public-safe placeholder만 사용한다.

## RISK-H-001: RateLimitFilter BFF 시크릿 파싱 정렬

### 현재 사실

- `BffSecretFilter`는 `readmates.security.bff.secrets`를 쉼표로 파싱하고 값이 없을 때만 `readmates.bff-secret`로 fallback한다.
- `RateLimitFilter`는 현재 `readmates.bff-secret`만 읽는다.
- BFF proxy는 서버 요청에 `X-Readmates-Bff-Secret`과 `X-Readmates-Client-IP`를 함께 전달한다.
- rate limit이 활성화된 상태에서 서버가 신규 다중 시크릿 설정만 사용하면 `RateLimitFilter`는 trusted client IP를 인정하지 못하고 proxy IP 기준으로 rate limit key를 만들 수 있다.

### 변경 후 동작

- `RateLimitFilter`는 trusted client IP 판단에 `BffSecretFilter`와 같은 우선순위를 사용한다.
- 우선순위는 `readmates.security.bff.secrets` 목록이 비어 있지 않으면 목록 전체, 비어 있으면 legacy `readmates.bff-secret` 단일 값이다.
- 제공된 `X-Readmates-Bff-Secret`은 목록 안의 모든 후보와 constant-time 비교한다.
- 설정된 trusted secret이 없으면 `X-Readmates-Client-IP`를 무시하고 기존처럼 `remoteAddr`를 사용한다.

### 구현 설계

`RateLimitFilter`의 생성자 호환성을 최대한 유지하기 위해 legacy 시크릿 인자는 기존 위치에 두고, 신규 목록 설정은 뒤에 추가한다.

```kotlin
class RateLimitFilter(
    private val rateLimitPort: RateLimitPort,
    private val properties: RateLimitProperties,
    @param:Value("\${readmates.bff-secret:}")
    private val legacyExpectedBffSecret: String = "",
    @param:Value("\${READMATES_IP_HASH_BASE_SECRET:}")
    private val ipHashBaseSecret: String = "",
    @param:Value("\${readmates.security.bff.secrets:}")
    private val configuredBffSecretsRaw: String = "",
) : OncePerRequestFilter()
```

시크릿 목록 계산은 필터 인스턴스 생성 시 한 번만 수행한다.

```kotlin
private val trustedBffSecrets: List<String> = run {
    val configured = configuredBffSecretsRaw
        .split(',')
        .map { it.trim() }
        .filter { it.isNotEmpty() }
    val legacy = legacyExpectedBffSecret.trim()
        .takeIf { it.isNotEmpty() }
        ?.let { listOf(it) }
        ?: emptyList()
    configured.ifEmpty { legacy }
}
```

trusted IP 판단은 목록 단위 비교로 바꾼다.

```kotlin
private fun HttpServletRequest.trustedClientIp(): String? {
    if (trustedBffSecrets.isEmpty()) {
        return null
    }

    val provided = getHeader(BFF_SECRET_HEADER) ?: return null
    if (!secretMatchesAny(provided, trustedBffSecrets)) {
        return null
    }

    return getHeader(CLIENT_IP_HEADER).trimmedIdentifier()
}

private fun secretMatchesAny(provided: String, expectedSecrets: List<String>): Boolean {
    val providedBytes = provided.toByteArray(StandardCharsets.UTF_8)
    var matched = false
    for (expected in expectedSecrets) {
        if (MessageDigest.isEqual(providedBytes, expected.toByteArray(StandardCharsets.UTF_8))) {
            matched = true
        }
    }
    return matched
}
```

### 테스트 기준

`server/src/test/kotlin/com/readmates/auth/infrastructure/security/RateLimitFilterTest.kt`에 다음 사례를 추가한다.

- configured secret list의 primary 값이 trusted client IP를 허용한다.
- configured secret list의 secondary 값도 trusted client IP를 허용한다.
- configured secret list가 있으면 legacy 값은 fallback으로 쓰이지 않는다.
- configured secret list가 비어 있을 때 legacy 값은 기존처럼 trusted client IP를 허용한다.

### 수용 기준

- 신규 rate limit 테스트가 통과한다.
- `BffSecretFilter`의 alias 계산이나 API 인증 정책은 바뀌지 않는다.
- `RateLimitCheck.key`에는 원본 IP, token, club slug가 그대로 들어가지 않는다.

## RISK-H-002: BFF 시크릿 감사 로그 볼륨 제어

### 현재 사실

- `BffSecretFilter`는 인증된 API 요청마다 `auditAsync(alias, request)`를 호출한다.
- `auditAsync`는 `CompletableFuture.runAsync`를 사용하고 별도 executor 경계가 없다.
- `JdbcBffSecretRotationAuditAdapter`는 요청마다 `bff_secret_rotation_audit`에 insert한다.
- 이 테이블의 목적은 시크릿 rotation 검증인데, 현재 기본값은 primary secret 정상 요청까지 모두 적재한다.

### 변경 후 동작

- 기본 감사 모드는 `rotation-only`이다.
- `rotation-only`는 alias가 `primary`가 아닌 경우에만 기록한다.
- `all` 모드는 현재와 같이 모든 성공 인증 요청을 기록한다.
- `off` 모드는 성공 인증 요청도 기록하지 않는다.
- 비동기 실행은 bounded executor를 사용하며 queue 포화 시 요청 처리를 막지 않고 warning 로그만 남긴다.

### 구현 설계

감사 모드 enum을 같은 security package에 둔다.

```kotlin
enum class BffSecretAuditMode {
    ROTATION_ONLY,
    ALL,
    OFF;

    fun shouldRecord(alias: String): Boolean =
        when (this) {
            ROTATION_ONLY -> alias != "primary"
            ALL -> true
            OFF -> false
        }

    companion object {
        fun from(raw: String): BffSecretAuditMode =
            when (raw.trim().lowercase()) {
                "", "rotation-only", "rotation_only" -> ROTATION_ONLY
                "all" -> ALL
                "off" -> OFF
                else -> throw IllegalArgumentException(
                    "readmates.security.bff.audit-mode must be one of rotation-only, all, off",
                )
            }
    }
}
```

Spring executor 설정은 bounded queue를 갖는 bean으로 둔다.

```kotlin
@Configuration
class BffSecretAuditExecutorConfig {
    @Bean("bffSecretAuditExecutor")
    fun bffSecretAuditExecutor(): ThreadPoolTaskExecutor =
        ThreadPoolTaskExecutor().apply {
            corePoolSize = 1
            maxPoolSize = 2
            queueCapacity = 1_000
            setThreadNamePrefix("bff-secret-audit-")
            setWaitForTasksToCompleteOnShutdown(false)
            initialize()
        }
}
```

`BffSecretFilter`는 모드와 executor를 주입받고, 성공 인증 후 기록 여부를 먼저 판단한다.

```kotlin
@param:Value("\${readmates.security.bff.audit-mode:rotation-only}")
private val auditModeRaw: String = "rotation-only",
@param:Qualifier("bffSecretAuditExecutor")
@param:Autowired(required = false)
private val auditExecutor: TaskExecutor? = null,
```

```kotlin
private val auditMode = BffSecretAuditMode.from(auditModeRaw)

private fun auditAsync(alias: String, request: HttpServletRequest) {
    val port = auditPort ?: return
    if (!auditMode.shouldRecord(alias)) {
        return
    }

    val clientIpHash = ClientIpHashing.hashClientIp(request.remoteAddr, ipHashBaseSecret)
    val path = request.requestURI
    val task = Runnable {
        try {
            port.recordUsage(alias, clientIpHash, path)
        } catch (ex: Exception) {
            operationalLogger.warn("BFF audit record failed: {}", ex.message)
        }
    }

    try {
        auditExecutor?.execute(task) ?: task.run()
    } catch (ex: TaskRejectedException) {
        operationalLogger.warn("BFF audit record skipped: {}", ex.message)
    }
}
```

운영 문서에는 보관 정책 예시를 public-safe SQL로만 추가한다.

```sql
delete from bff_secret_rotation_audit
where used_at < utc_timestamp() - interval 30 day;
```

### 테스트 기준

`server/src/test/kotlin/com/readmates/auth/infrastructure/security/BffSecretFilterAuditTest.kt`의 기존 primary audit 기대값을 변경한다.

- 기본 모드에서 primary alias는 기록하지 않는다.
- 기본 모드에서 secondary alias는 기록한다.
- `all` 모드에서 primary alias도 기록한다.
- `off` 모드에서 secondary alias도 기록하지 않는다.
- audit port 예외와 executor reject가 API 응답에 영향을 주지 않는다.

### 수용 기준

- 인증 실패 요청은 여전히 audit port를 호출하지 않는다.
- 감사 기록 실패는 성공 API 응답을 실패시키지 않는다.
- rotation 검증 시 secondary alias 사용 여부는 계속 확인할 수 있다.
- 신규 설정 이름은 서버 전용이며 `VITE_*` 또는 frontend bundle에 노출되지 않는다.

## RISK-H-003: Public Release 프론트 산출물 차단

### 현재 사실

- `scripts/build-public-release-candidate.sh`는 `front` 복사 시 `output`, `node_modules`, `dist`만 제외한다.
- Playwright/Vitest 실행 후 `front/test-results`, `front/playwright-report`, `front/coverage`가 생성될 수 있다.
- `scripts/public-release-check.sh`의 forbidden path 목록도 위 프론트 산출물을 명시적으로 차단하지 않는다.

### 변경 후 동작

- public release 후보 생성 시 아래 경로는 복사하지 않는다.
  - `front/test-results`
  - `front/playwright-report`
  - `front/coverage`
  - `front/.nyc_output`
- public release 검사도 같은 경로가 존재하면 실패한다.
- fixture 검증은 forbidden path 차단이 실제로 작동하는지 재현한다.

### 구현 설계

`copy_manifest`의 `copy_dir "front"` 호출에 exclude를 추가한다.

```bash
copy_dir "front" \
  --exclude='/output/' \
  --exclude='/node_modules/' \
  --exclude='/dist/' \
  --exclude='/test-results/' \
  --exclude='/playwright-report/' \
  --exclude='/coverage/' \
  --exclude='/.nyc_output/'
```

`public-release-check.sh`의 `is_forbidden_path`는 현재 lower-case normalized path를 사용하므로 아래 case를 추가한다.

```bash
front/test-results|front/test-results/*) return 0 ;;
front/playwright-report|front/playwright-report/*) return 0 ;;
front/coverage|front/coverage/*) return 0 ;;
front/.nyc_output|front/.nyc_output/*) return 0 ;;
```

`verify-public-release-fixtures.sh`는 fixture root 아래에 forbidden artifact path를 만들고 checker가 실패하는지 확인한다.

### 테스트 기준

- `bash -n scripts/build-public-release-candidate.sh scripts/public-release-check.sh scripts/verify-public-release-fixtures.sh`
- `./scripts/verify-public-release-fixtures.sh`
- `./scripts/build-public-release-candidate.sh`
- `./scripts/public-release-check.sh .tmp/public-release-candidate`
- 후보 생성 후 `front/test-results`, `front/playwright-report`, `front/coverage`, `front/.nyc_output`가 candidate 안에 없어야 한다.

### 수용 기준

- release 후보에서 프론트 생성 산출물이 빠진다.
- private working tree에 산출물이 있어도 후보 생성은 성공한다.
- 후보 안에 산출물이 강제로 들어가면 checker가 실패한다.

## RISK-H-004: Platform Admin Persistence 예외 경계 정리

### 현재 사실

- `JdbcPlatformAdminAdapter`는 `org.springframework.http.HttpStatus`와 `org.springframework.web.server.ResponseStatusException`를 import한다.
- club not found, duplicate hostname, domain not found 상태를 persistence adapter에서 HTTP status로 직접 표현한다.
- `PlatformAdminService`와 `PlatformAdminErrorHandler`에는 이미 application error를 HTTP status로 매핑하는 구조가 있다.

### 변경 후 동작

- persistence adapter는 HTTP/Web 타입을 import하거나 throw하지 않는다.
- club not found와 duplicate hostname은 port 결과로 application service에 전달된다.
- application service는 `PlatformAdminException`을 던지고 inbound web error handler가 HTTP status로 매핑한다.
- architecture test는 persistence adapter에서 Spring Web/HTTP 예외가 다시 들어오면 실패한다.

### 구현 설계

`PlatformAdminPorts.kt`에 port 결과 타입을 추가한다.

```kotlin
sealed interface CreateClubDomainResult {
    data class Created(val domain: PlatformAdminClubDomain) : CreateClubDomainResult
    data object ClubNotFound : CreateClubDomainResult
    data object DuplicateHostname : CreateClubDomainResult
}
```

create port는 결과 타입을 반환한다.

```kotlin
interface CreateClubDomainPort {
    fun createClubDomain(
        clubId: UUID,
        hostname: String,
        kind: ClubDomainKind,
        isPrimary: Boolean,
    ): CreateClubDomainResult
}
```

update port는 not found를 nullable로 표현한다.

```kotlin
interface UpdateClubDomainProvisioningPort {
    fun updateClubDomainProvisioning(
        domainId: UUID,
        status: ClubDomainStatus,
        verifiedAt: OffsetDateTime?,
        lastCheckedAt: OffsetDateTime,
        errorCode: String?,
    ): PlatformAdminClubDomain?
}
```

`PlatformAdminService`는 port 결과를 application error로 매핑한다.

```kotlin
return when (
    val result = createClubDomainPort.createClubDomain(
        clubId = clubId,
        hostname = hostname,
        kind = command.kind,
        isPrimary = command.isPrimary,
    )
) {
    is CreateClubDomainResult.Created -> result.domain
    CreateClubDomainResult.ClubNotFound -> throw PlatformAdminException(
        PlatformAdminError.CLUB_DOMAIN_NOT_FOUND,
        "Club not found",
    )
    CreateClubDomainResult.DuplicateHostname -> throw PlatformAdminException(
        PlatformAdminError.CLUB_DOMAIN_CONFLICT,
        "Club domain hostname already exists",
    )
}
```

`JdbcPlatformAdminAdapter`는 DB 결과를 port 결과로 바꾼다.

```kotlin
if (clubExists == 0L) {
    return CreateClubDomainResult.ClubNotFound
}

return try {
    jdbcTemplate.update(/* insert */)
    CreateClubDomainResult.Created(/* mapped domain */)
} catch (_: DuplicateKeyException) {
    CreateClubDomainResult.DuplicateHostname
}
```

architecture test는 source scan으로 persistence adapter의 forbidden import를 차단한다.

```kotlin
@Test
fun `persistence adapters do not depend on spring web http exception types`() {
    val forbiddenPrefixes = listOf(
        "org.springframework.http.",
        "org.springframework.web.",
    )
    val violations = persistenceAdapterSourceFiles()
        .flatMap { sourceFile ->
            sourceFile.readLines()
                .filter { line ->
                    val importName = line.trim().removePrefix("import ").trim()
                    forbiddenPrefixes.any { forbiddenPrefix -> importName.startsWith(forbiddenPrefix) }
                }
                .map { line -> "${sourceFile.relativeTo(sourceRoot())}: ${line.trim()}" }
        }
        .sorted()

    assertTrue(
        violations.isEmpty(),
        "Persistence adapters must not depend on Spring HTTP/Web types:\n${violations.joinToString("\n")}",
    )
}
```

### 테스트 기준

- 신규 architecture test는 구현 전 `JdbcPlatformAdminAdapter`의 forbidden import 때문에 실패한다.
- 구현 후 architecture test가 통과한다.
- `PlatformAdminControllerTest`의 create duplicate, missing club, missing domain 관련 HTTP status 기대값이 유지된다.
- `./server/gradlew -p server clean test`가 통과한다.

### 수용 기준

- `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcPlatformAdminAdapter.kt`에서 `ResponseStatusException`과 `HttpStatus` import가 사라진다.
- HTTP status 결정은 `PlatformAdminErrorHandler`에 남는다.
- persistence adapter는 DB 예외를 port 결과 또는 adapter 내부 처리로만 변환한다.

## 실행 전 주의사항

- 현재 작업트리는 `main...origin/main [ahead 29]` 상태이고 `.gitignore`에 기존 변경이 있다. 구현자는 이 변경을 되돌리지 않는다.
- 구현 전 `git status --short --branch`로 unrelated 변경을 확인하고, 이번 리스크와 무관한 파일은 건드리지 않는다.
- public release 관련 명령은 `.tmp/public-release-candidate`를 갱신한다. 실행 후 git status에서 추적 파일 변경만 확인한다.

## 완료 정의

- 4개 리스크의 테스트가 모두 구현되어 실패 재현 후 통과 상태가 된다.
- 서버 전체 테스트, 프론트 lint/test/build, E2E, public release candidate 검사가 통과한다.
- 변경 문서와 deploy 문서에 real member data, private domain, local absolute path, real secret value가 없다.
- 남은 리스크는 구현 범위 밖 또는 로컬 도구 미설치 같은 검증 제한으로만 정리된다.
