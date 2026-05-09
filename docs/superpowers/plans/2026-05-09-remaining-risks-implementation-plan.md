# 남은 리스크 구현 계획 — 2026-05-09

> 스팩: `docs/superpowers/specs/2026-05-09-remaining-risks-spec.md`
> 대상 버전: v1.5.2 이후 release
> v1 plan 연관: TASK-071 (BFF multi-secret rotation)
> v2 plan 연관: TASK-V2-022/V2-023 (legacy password rename/drop), TASK-V2-028 (IP hash 주간 회전),
> TASK-V2-029 (BFF rotation audit log)

## 개요

본 plan은 v1.5.2 이후 release 사이클에서 처리해야 할 **세 영역의 잔여 리스크**를 4개 task
(TASK-R-001 ~ TASK-R-003b)로 분해한 실행 계획이다. v1 plan(TASK-071)과 v2 plan(TASK-V2-029)에서
교착 상태였던 BFF multi-secret rotation을 본 plan에서 단일 흐름으로 풀어낸다.

| Task | 제목 | Phase | 우선순위 | 난이도 | 예상 소요 |
|------|------|-------|---------|--------|---------|
| TASK-R-001 | Legacy password column 및 dead code 제거 | A | P1 | S | 0.5일 |
| TASK-R-002 | `READMATES_IP_HASH_BASE_SECRET` production 설정 | A | P1 | S | 0.25일 |
| TASK-R-003a | BFF multi-secret rotation 지원 | B | P2 | M | 1일 |
| TASK-R-003b | BFF rotation audit log + drill 문서 | C | P2 | M | 1일 |

총 예상 소요: ~2.75일 (서버 + 인프라 + 문서 작업 합산).

## 전제조건 및 순서

- 현재 production tag: **v1.5.2**.
- main에 이미 머지되어 있으나 production에 배포되지 않은 변경:
  - `V24__legacy_password_hash_rename.sql`
  - `V25__drop_legacy_password_hash.sql`
- 권장 진행 순서 (release 단위):
  1. **release N**: TASK-R-001 + TASK-R-002 (서버 코드 변경 + 인프라 환경변수 추가).
  2. **release N+1**: TASK-R-003a (BFF + Spring multi-secret).
  3. **release N+2**: TASK-R-003b (audit log + 회전 drill 문서, TASK-R-003a 배포 완료 이후).

- 각 task 시작 시 dirty worktree 확인:
  ```bash
  git status --short --untracked-files=all
  ```
- 각 task 종료 시 다음 검증을 공통 quality gate로 적용한다.
  ```bash
  ./server/gradlew -p server test
  ./server/gradlew -p server test --tests 'com.readmates.architecture.*'
  cd front && pnpm typecheck && pnpm test
  ```

---

## TASK-R-001: Legacy password column 및 dead code 제거

- **Phase**: A
- **우선순위**: P1
- **난이도**: S
- **예상 소요**: 0.5일
- **선행 조건**: 없음 (V24·V25 이미 main에 머지됨)
- **관련 스팩**: SPEC-R-001
- **관련 파일**:
  - `server/src/main/resources/db/migration/V24__legacy_password_hash_rename.sql` (이미 존재)
  - `server/src/main/resources/db/migration/V25__drop_legacy_password_hash.sql` (이미 존재)
  - `server/src/main/kotlin/com/readmates/auth/api/PasswordResetController.kt` (삭제)
  - `server/src/main/kotlin/com/readmates/auth/config/SecurityConfig.kt` (3 라인 제거)
  - `docs/release-notes/v1.5.x.md` 또는 다음 release notes 파일
  - `docs/deploy/oci-backend.md` (legacy password 관련 가이드 제거)

- **구현 단계**:
  1. **사전 grep**: production code에 legacy password 흔적이 더 남아있지 않은지 확인.
     ```bash
     rg -n 'password_hash|password_set_at|password-reset|PasswordResetController' \
       server/src/main front/src front/functions
     ```
     기대 결과:
     - `server/src/main`에 `PasswordResetController.kt` 1개 + `SecurityConfig.kt` 3 라인.
     - `front/src`, `front/functions`는 hit 0건.
     예상치 외의 hit가 있으면 task 분리 후 재계획.

  2. **PasswordResetController.kt 삭제**.
     ```bash
     git rm server/src/main/kotlin/com/readmates/auth/api/PasswordResetController.kt
     ```
     해당 파일은 410 GONE만 던지는 stub이므로 삭제 후 라우팅이 사라져 자동으로 404가 된다.

  3. **SecurityConfig.kt 라인 3개 제거**. 다음 3개를 정확히 찾아서 제거한다.
     - csrf string matchers 블록:
       ```kotlin
       it.ignoringRequestMatchers(
           "/api/auth/login",
           "/api/auth/logout",
           "/api/auth/password-reset/**",   // ← 제거
           ...
       )
       ```
     - csrf regex matchers 블록:
       ```kotlin
       it.ignoringRequestMatchers(
           methodAndPath("POST", Regex("^/api/host/members/[^/]+/password-reset$")), // ← 제거
           ...
       )
       ```
     - `authorizeHttpRequests { ... }` 의 permitAll 블록:
       ```kotlin
       authorizeHttpRequests {
           it.requestMatchers(
               "/api/auth/login",
               "/api/auth/password-reset/**",  // ← 제거
               ...
           ).permitAll()
       }
       ```

  4. **테스트 정리**. password 관련 테스트가 일부 남아 있을 수 있으니 다음을 grep해 일괄 삭제 또는
     skip 처리한다.
     ```bash
     rg -n 'password-reset|PasswordReset' server/src/test
     ```
     해당 파일이 있다면 이 task에서 함께 삭제한다 (의미 없는 410 검증 테스트).

  5. **release notes 업데이트**. `docs/release-notes/v1.5.x.md` 또는 다음 minor release notes
     파일에 다음 항목을 추가한다.
     ```markdown
     ### Removed
     - Legacy password column dropped from `users` table (Flyway V24, V25).
     - `POST /api/auth/password-reset/{token}`, `POST /api/host/members/{id}/password-reset`
       endpoints removed (previously returned 410 GONE).
     ```

  6. **docs/deploy/oci-backend.md** 등 운영 문서에서 legacy password reset 절차 안내가 남아 있으면
     일괄 제거.

  7. **PR 단일화**. V24/V25 + code 삭제 + docs 업데이트를 단일 PR로 묶고, 제목을
     `feat(auth): drop legacy password column and remove dead reset endpoints` 형태로 작성한다.

- **검증 방법**:
  - `./server/gradlew -p server test` 통과.
  - `./server/gradlew -p server test --tests 'com.readmates.architecture.*'` 통과.
  - `rg -n 'password_hash|password_set_at|password-reset' server/src/main front/src front/functions`
    결과가 0건 (Flyway V24/V25 SQL 파일과 release notes만 hit되는 것은 OK).
  - staging deploy 후 다음 두 endpoint가 404 응답:
    ```bash
    curl -i -X POST https://<staging>/api/auth/password-reset/abc
    curl -i -X POST https://<staging>/api/host/members/123/password-reset
    ```
  - staging에서 회원가입 → invitation accept → Google OAuth login → session create end-to-end
    확인.
  - production deploy 후 다음 SQL이 빈 결과를 반환:
    ```sql
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users'
      AND column_name IN ('password_hash','password_set_at',
                          'legacy_password_hash','legacy_password_set_at');
    ```

- **주의사항**:
  - V24와 V25를 분리해서 두 release에 나눠 배포하지 않는다 (스팩 결정에 따라 단일 release).
  - down migration은 작성하지 않는다. 롤백은 docker tag 단위 + DB backup snapshot.
  - `SecurityConfig.kt` 수정 시 인접한 라인을 함께 지우지 않도록 주의 (CSRF / permitAll 정책의
    다른 entry는 그대로 유지).
  - 테스트 환경의 H2 / Testcontainers MySQL 모두 V24/V25가 적용된 상태에서 기존 fixture가
    `password_hash` 컬럼 INSERT를 시도하지 않는지 확인. 시도하면 fixture 정리도 본 task에 포함.

---

## TASK-R-002: `READMATES_IP_HASH_BASE_SECRET` production 설정

- **Phase**: A
- **우선순위**: P1
- **난이도**: S
- **예상 소요**: 0.25일
- **선행 조건**: 없음
- **관련 스팩**: SPEC-R-002
- **관련 파일**:
  - production OCI Compute 인스턴스의 `~/readmates/.env` (또는 운영 절차상 정의된 경로)
  - `docker/compose.yml` 또는 `infra/oci/compose.yml` (운영 위치 확인 필요)
  - 1Password (또는 운영 secret manager) entry
  - `docs/deploy/oci-backend.md`

- **구현 단계**:
  1. **secret 생성** (로컬에서, 출력값을 즉시 1Password에 저장).
     ```bash
     openssl rand -base64 32
     ```
  2. **1Password 등록**. team vault > "ReadMates ops" item에
     `READMATES_IP_HASH_BASE_SECRET` 필드를 추가하고 위 값을 저장한다.

  3. **OCI Compute SSH 접속 후 `.env` 갱신**.
     ```bash
     ssh ubuntu@<oci-host>
     cd ~/readmates
     # .env 백업
     cp .env .env.bak.$(date +%Y%m%d)
     # 한 줄 추가 (이미 있으면 갱신)
     grep -q '^READMATES_IP_HASH_BASE_SECRET=' .env \
       && sed -i 's|^READMATES_IP_HASH_BASE_SECRET=.*|READMATES_IP_HASH_BASE_SECRET=<value>|' .env \
       || echo 'READMATES_IP_HASH_BASE_SECRET=<value>' >> .env
     ```

  4. **`compose.yml` 확인**. spring 서비스가 `env_file: .env` 또는 environment 섹션에서
     `READMATES_IP_HASH_BASE_SECRET=${READMATES_IP_HASH_BASE_SECRET}`를 받고 있는지 확인. 누락된
     경우 한 줄 추가.
     ```yaml
     services:
       spring:
         env_file:
           - .env
         environment:
           READMATES_IP_HASH_BASE_SECRET: ${READMATES_IP_HASH_BASE_SECRET}
     ```

  5. **container restart**.
     ```bash
     docker compose pull spring
     docker compose up -d spring
     docker compose logs --tail 200 spring
     ```

  6. **운영 문서 업데이트**. `docs/deploy/oci-backend.md`에 다음 섹션을 추가한다.
     ```markdown
     ### IP hash base secret

     `READMATES_IP_HASH_BASE_SECRET` 환경변수는 client IP hash의 주간 salt rotation에서
     base secret 역할을 한다. 한 번 생성한 후 manual rotation 대상이 아니다.
     생성: `openssl rand -base64 32`. 1Password에 저장한다.
     누락 시 rate limit 자체는 동작하지만, cross-week linking 방지 효과가 사라진다.
     ```

  7. **(선택, REQ-R-002-5-bis)** Spring 측 startup-time WARN 추가. `RateLimitFilter` 또는
     dedicated `@PostConstruct`에서 다음을 logging.
     ```kotlin
     if (ipHashBaseSecret.isBlank()) {
         logger.warn(
             "READMATES_IP_HASH_BASE_SECRET is empty; weekly IP-hash salt rotation " +
             "is degraded. Set this env var in production."
         )
     }
     ```
     이 강화는 같은 release에 코드 변경을 추가하기로 결정한 경우에만 포함한다.

- **검증 방법**:
  - production OCI에서:
    ```bash
    docker compose exec spring printenv READMATES_IP_HASH_BASE_SECRET
    ```
    결과가 비어 있지 않은 base64 또는 hex 문자열이어야 한다.
  - Spring 로그에 `RateLimitFilter` 초기화가 정상 출력되며 위 WARN이 발생하지 않아야 한다 (선택
    강화 적용 시).
  - `./server/gradlew -p server test --tests
    'com.readmates.shared.security.ClientIpHashingTest'` 통과.
  - 동일 IP의 hash 값이 ISO week 경계를 넘었을 때 변경되는지를 fixed clock unit test로 확인
    (이미 존재하는 `ClientIpHashingTest` 케이스에서 보증되어야 함).

- **주의사항**:
  - 본 환경변수 값은 절대 git, Slack, GitHub issue, Cloudflare Pages env 등 외부 surface에
    노출되지 않아야 한다. 1Password vault 외 어디에도 평문 보관 금지.
  - secret 변경 시에는 모든 IP의 hash가 동시에 변하므로 rate limit bucket이 사실상 reset된다.
    이 영향을 인지한 운영자가 의도적으로 수행할 때만 변경한다.
  - 본 task는 코드 변경 없이도 완결될 수 있다 (선택 강화 미적용 시 docs + env만 수정).

---

## TASK-R-003a: BFF multi-secret rotation 지원

- **Phase**: B
- **우선순위**: P2
- **난이도**: M
- **예상 소요**: 1일
- **선행 조건**: 없음 (TASK-R-001/R-002와 독립). 단, **TASK-R-003b가 본 task에 의존**한다.
- **관련 스팩**: SPEC-R-003a (v1 TASK-071 승계)
- **관련 파일**:
  - `server/src/main/kotlin/com/readmates/security/filter/BffSecretFilter.kt` (또는 현재 위치)
  - `server/src/main/resources/application.yml`
  - `server/src/test/kotlin/com/readmates/security/filter/BffSecretFilterTest.kt`
  - `server/src/test/kotlin/com/readmates/security/filter/BffSecretFilterUnitTest.kt`
  - `server/src/test/kotlin/com/readmates/security/filter/BffSecretFilterDynamicOriginTest.kt`
  - `front/functions/api/_shared/proxy.ts`
  - `front/functions/api/bff/[[path]].ts`
  - 그 외 `bffSecretFromEnv`를 호출하는 모든 BFF 라우트 함수 (oauth, auth 콜백 등)

- **구현 단계**:

  1. **application.yml 갱신**.
     ```yaml
     readmates:
       # legacy 단일 secret (backward compat)
       bff-secret: ${READMATES_BFF_SECRET:}
       bff-secret-required: ${READMATES_BFF_SECRET_REQUIRED:true}
       security:
         bff:
           secrets: ${READMATES_BFF_SECRETS:}
     ```

  2. **BffSecretFilter 리팩터**. 단일 `expectedSecret: String`을 multi-secret로 교체.
     ```kotlin
     @Component
     class BffSecretFilter(
         @param:Value("\${readmates.security.bff.secrets:}")
         private val configuredSecretsRaw: String,
         @param:Value("\${readmates.bff-secret:}")
         private val legacyExpectedSecret: String,
         @param:Value("\${readmates.bff-secret-required:true}")
         private val bffSecretRequired: Boolean,
         private val allowedOriginPort: AllowedOriginPort,
     ) : OncePerRequestFilter() {

         private val secrets: List<String> = run {
             val fromList = configuredSecretsRaw
                 .split(',')
                 .map { it.trim() }
                 .filter { it.isNotBlank() }
             val fromLegacy = legacyExpectedSecret.trim()
                 .takeIf { it.isNotBlank() }
                 ?.let { listOf(it) }
                 ?: emptyList()
             // configured 리스트가 비어 있을 때만 legacy 단일 값을 사용
             if (fromList.isNotEmpty()) fromList else fromLegacy
         }

         init {
             if (bffSecretRequired && secrets.isEmpty()) {
                 throw IllegalStateException(
                     "readmates.security.bff.secrets must contain at least one entry " +
                     "when readmates.bff-secret-required is true"
                 )
             }
         }

         override fun doFilterInternal(
             request: HttpServletRequest,
             response: HttpServletResponse,
             filterChain: FilterChain,
         ) {
             if (isApiRequest(request) && secrets.isNotEmpty()) {
                 val provided = request.getHeader(BFF_SECRET_HEADER)
                 if (provided.isNullOrBlank() || !matchesAny(provided, secrets)) {
                     response.status = HttpStatus.UNAUTHORIZED.value()
                     return
                 }
             }
             filterChain.doFilter(request, response)
         }

         private fun matchesAny(provided: String, candidates: List<String>): Boolean {
             val providedBytes = provided.toByteArray(StandardCharsets.UTF_8)
             // timing-safe iteration: 모든 후보를 비교
             var matched = false
             for (candidate in candidates) {
                 val candidateBytes = candidate.toByteArray(StandardCharsets.UTF_8)
                 if (MessageDigest.isEqual(providedBytes, candidateBytes)) {
                     matched = true
                     // early-return 대신 loop 끝까지 진행 → timing 균등화
                 }
             }
             return matched
         }
     }
     ```
     `matchesAny`에서 early-return을 하지 않고 모든 entry를 비교함으로써 매칭 여부와 무관하게
     loop 시간이 일정해지도록 한다.

  3. **secret_alias resolution helper** (TASK-R-003b가 활용). filter 내부에 다음 helper를 둔다.
     ```kotlin
     private fun aliasFor(provided: String): String? {
         val providedBytes = provided.toByteArray(StandardCharsets.UTF_8)
         secrets.forEachIndexed { idx, candidate ->
             if (MessageDigest.isEqual(
                     providedBytes, candidate.toByteArray(StandardCharsets.UTF_8))) {
                 return when (idx) {
                     0 -> "primary"
                     1 -> "secondary"
                     else -> "index_$idx"
                 }
             }
         }
         return null
     }
     ```
     본 task에서는 `aliasFor`를 사용하지 않아도 좋으나, TASK-R-003b를 위해 미리 만들어둔다.

  4. **테스트 갱신**. 기존 3개 테스트 파일을 multi-secret 시그니처에 맞춰 수정한다.
     - `BffSecretFilterTest.kt`: 두 secret 모두 200 / 임의 값 401 케이스 추가.
     - `BffSecretFilterUnitTest.kt`: `bff-secret-required=true` + secrets 비어있음 → startup 실패
       검증.
     - `BffSecretFilterDynamicOriginTest.kt`: 기존 dynamic origin 테스트 유지하되 secret 주입 방식만
       multi-secret로 갱신.

     예시 케이스:
     ```kotlin
     @Test
     fun `secondary secret should also pass`() {
         val filter = BffSecretFilter(
             configuredSecretsRaw = "secret1,secret2",
             legacyExpectedSecret = "",
             bffSecretRequired = true,
             allowedOriginPort = stubAllowedOriginPort(),
         )
         val request = MockHttpServletRequest("POST", "/api/something").apply {
             addHeader(BFF_SECRET_HEADER, "secret2")
         }
         val response = MockHttpServletResponse()
         filter.doFilter(request, response, MockFilterChain())
         assertThat(response.status).isEqualTo(200)
     }
     ```

  5. **front/functions/api/_shared/proxy.ts 수정**.
     ```typescript
     export function bffSecretFromEnv(env: {
       READMATES_BFF_SECRETS?: string;
       READMATES_BFF_SECRET?: string;
     }): string | null {
       const list = env.READMATES_BFF_SECRETS?.trim();
       if (list) {
         const first = list
           .split(",")
           .map((s) => s.trim())
           .find((s) => s.length > 0);
         if (first) return first;
       }
       const legacy = env.READMATES_BFF_SECRET?.trim();
       if (legacy) return legacy;
       return null;
     }
     ```

  6. **`forwardedOAuthRequestHeaders` 등 다른 helper 동기화**. `proxy.ts` 내부에서
     `env.READMATES_BFF_SECRET`을 직접 참조하던 코드가 있다면 모두 `bffSecretFromEnv(env)`를
     거치도록 변경한다. grep:
     ```bash
     rg -n 'READMATES_BFF_SECRET' front/functions
     ```
     기대 결과: `proxy.ts` 안의 `bffSecretFromEnv` 정의부와 `[[path]].ts`의 `Env` 타입 외에는
     hit가 없어야 한다.

  7. **front/functions/api/bff/[[path]].ts** Env 타입에 `READMATES_BFF_SECRETS?: string` 추가.
     ```typescript
     type Env = {
       READMATES_API_BASE_URL: string;
       READMATES_BFF_SECRET?: string;   // legacy fallback
       READMATES_BFF_SECRETS?: string;  // comma-separated, primary first
     };
     ```

  8. **타입 체크 / 린트**.
     ```bash
     cd front && pnpm typecheck
     cd front && pnpm lint
     ```

  9. **회전 drill — staging**. 다음 절차로 401 0건 검증.
     - 단계 1: `READMATES_BFF_SECRETS=secret1` (server + Pages) → 정상 트래픽.
     - 단계 2: server에 `secret1,secret2` 등록, Pages는 `secret1` 유지 → 200.
     - 단계 3: Pages를 `secret1,secret2`로 갱신 → 200.
     - 단계 4: BFF env를 `secret2,secret1`로 swap → 200 (이제 BFF가 secret2를 보냄).
     - 단계 5: server를 `secret2`로 축소 → 200.

- **검증 방법**:
  - `./server/gradlew -p server test --tests 'com.readmates.security.BffSecretFilter*'` 모든
    테스트 통과.
  - `./server/gradlew -p server test --tests 'com.readmates.architecture.*'` 통과.
  - `cd front && pnpm typecheck && pnpm lint && pnpm test` 통과.
  - staging 회전 drill 단계 1~5 동안 401 발생 0건.
  - production 배포 후 단일 secret 환경(`READMATES_BFF_SECRET` only)이 그대로 동작 (backward
    compat 검증).

- **주의사항**:
  - secret 매칭에서 절대 `==` 또는 `String.equals` 사용 금지. `MessageDigest.isEqual` 강제.
  - secrets 리스트가 비어 있을 때 `bff-secret-required=false`이면 모든 요청이 통과한다는 점은
    legacy 동작과 동일하다 (보안 정책 변경 아님). 운영 환경에서는 `bff-secret-required=true` 유지.
  - secrets에 comma 포함 금지 (운영 가이드에 명시). 운영자가 base64 secret을 그대로 사용할 때
    base64 alphabet에는 comma가 없으므로 안전.
  - `aliasFor`를 본 task에 추가하더라도 호출처가 없으면 unused warning을 막기 위해
    `@Suppress("unused")`를 일시적으로 적용한다. TASK-R-003b에서 즉시 사용된다.

---

## TASK-R-003b: BFF rotation audit log + drill 문서

- **Phase**: C
- **우선순위**: P2
- **난이도**: M
- **예상 소요**: 1일
- **선행 조건**:
  - **TASK-R-003a 완료 및 production 배포 완료**.
  - TASK-R-002 완료 권장 (`client_ip_hash` 품질을 위해).
- **관련 스팩**: SPEC-R-003b (v2 TASK-V2-029 승계)
- **관련 파일**:
  - `server/src/main/resources/db/migration/V26__bff_secret_rotation_audit.sql` (신규)
  - `server/src/main/kotlin/com/readmates/security/application/port/out/BffSecretRotationAuditPort.kt` (신규)
  - `server/src/main/kotlin/com/readmates/security/adapter/out/persistence/JdbcBffSecretRotationAuditAdapter.kt` (신규)
  - `server/src/main/kotlin/com/readmates/security/filter/BffSecretFilter.kt` (수정 — port 주입 + 비동기 호출)
  - `server/src/main/kotlin/com/readmates/ReadmatesApplication.kt` (`@EnableAsync` 미적용 시 추가)
  - `server/src/test/kotlin/com/readmates/security/filter/BffSecretFilterAuditTest.kt` (신규)
  - `docs/deploy/oci-backend.md` (회전 drill 추가)

- **구현 단계**:

  1. **Flyway V26 추가**.
     ```sql
     -- V26__bff_secret_rotation_audit.sql
     create table bff_secret_rotation_audit (
       id bigint unsigned not null auto_increment primary key,
       secret_alias varchar(64) not null,
       used_at datetime(6) not null,
       client_ip_hash char(64),
       request_path varchar(255),
       index bff_secret_rotation_audit_alias_used_at_idx (secret_alias, used_at)
     );
     ```

  2. **Port 인터페이스**.
     ```kotlin
     // BffSecretRotationAuditPort.kt
     package com.readmates.security.application.port.out

     interface BffSecretRotationAuditPort {
         fun recordUsage(
             secretAlias: String,
             clientIpHash: String?,
             requestPath: String?,
         )
     }
     ```

  3. **JDBC adapter**.
     ```kotlin
     // JdbcBffSecretRotationAuditAdapter.kt
     package com.readmates.security.adapter.out.persistence

     import com.readmates.security.application.port.out.BffSecretRotationAuditPort
     import org.slf4j.LoggerFactory
     import org.springframework.jdbc.core.JdbcTemplate
     import org.springframework.stereotype.Component
     import java.time.OffsetDateTime
     import java.time.ZoneOffset

     @Component
     class JdbcBffSecretRotationAuditAdapter(
         private val jdbcTemplate: JdbcTemplate,
     ) : BffSecretRotationAuditPort {
         private val log = LoggerFactory.getLogger(javaClass)

         override fun recordUsage(
             secretAlias: String,
             clientIpHash: String?,
             requestPath: String?,
         ) {
             try {
                 jdbcTemplate.update(
                     """
                     insert into bff_secret_rotation_audit
                       (secret_alias, used_at, client_ip_hash, request_path)
                     values (?, ?, ?, ?)
                     """.trimIndent(),
                     secretAlias,
                     OffsetDateTime.now(ZoneOffset.UTC),
                     clientIpHash,
                     requestPath?.take(255),
                 )
             } catch (ex: Exception) {
                 log.warn("Failed to record bff secret rotation audit: {}", ex.message)
             }
         }
     }
     ```

  4. **`@EnableAsync` 활성화** (이미 있으면 skip).
     ```kotlin
     // ReadmatesApplication.kt
     @SpringBootApplication
     @EnableAsync
     @EnableScheduling
     class ReadmatesApplication
     ```

  5. **BffSecretFilter에서 audit port 호출**.
     ```kotlin
     @Component
     class BffSecretFilter(
         @param:Value("\${readmates.security.bff.secrets:}") private val configuredSecretsRaw: String,
         @param:Value("\${readmates.bff-secret:}") private val legacyExpectedSecret: String,
         @param:Value("\${readmates.bff-secret-required:true}") private val bffSecretRequired: Boolean,
         private val allowedOriginPort: AllowedOriginPort,
         @param:Value("\${READMATES_IP_HASH_BASE_SECRET:}") private val ipHashBaseSecret: String,
         @Autowired(required = false)
         private val auditPort: BffSecretRotationAuditPort? = null,
     ) : OncePerRequestFilter() {
         // secrets, init, matchesAny, aliasFor 는 TASK-R-003a 그대로

         override fun doFilterInternal(
             request: HttpServletRequest,
             response: HttpServletResponse,
             filterChain: FilterChain,
         ) {
             if (isApiRequest(request) && secrets.isNotEmpty()) {
                 val provided = request.getHeader(BFF_SECRET_HEADER)
                 val alias = provided?.let { aliasFor(it) }
                 if (alias == null) {
                     response.status = HttpStatus.UNAUTHORIZED.value()
                     return
                 }
                 // 비동기 audit (request critical path 보호)
                 auditAsync(alias, request)
             }
             filterChain.doFilter(request, response)
         }

         private fun auditAsync(alias: String, request: HttpServletRequest) {
             val port = auditPort ?: return
             val clientIp = request.remoteAddr // 또는 X-Forwarded-For 처리 helper
             val ipHash = ClientIpHashing.hashClientIp(clientIp, ipHashBaseSecret)
             val path = request.requestURI
             CompletableFuture.runAsync {
                 port.recordUsage(alias, ipHash, path)
             }
         }
     }
     ```
     `CompletableFuture.runAsync` 대신 `@Async`를 사용하는 경우, audit 호출을 별도 `@Service`로
     이동하고 `BffSecretFilter`가 그 service를 inject하는 형태로 만든다 (`@Async`는 self-invocation
     시 동작하지 않으므로 외부 bean 호출 필요).

  6. **단위 테스트** (`BffSecretFilterAuditTest.kt`).
     ```kotlin
     @Test
     fun `successful match should call audit port once`() {
         val auditPort = mockk<BffSecretRotationAuditPort>(relaxed = true)
         val filter = BffSecretFilter(
             configuredSecretsRaw = "secret1,secret2",
             legacyExpectedSecret = "",
             bffSecretRequired = true,
             allowedOriginPort = stubAllowedOriginPort(),
             ipHashBaseSecret = "fixed-test-secret",
             auditPort = auditPort,
         )
         val req = MockHttpServletRequest("POST", "/api/x")
             .apply { addHeader(BFF_SECRET_HEADER, "secret2") }
         filter.doFilter(req, MockHttpServletResponse(), MockFilterChain())
         // CompletableFuture.runAsync은 default ForkJoinPool에서 실행 → 짧은 wait 후 검증
         await().atMost(Duration.ofSeconds(2)).untilAsserted {
             verify(exactly = 1) {
                 auditPort.recordUsage(
                     secretAlias = "secondary",
                     clientIpHash = any(),
                     requestPath = "/api/x",
                 )
             }
         }
     }

     @Test
     fun `audit port failure must not affect response`() {
         val auditPort = mockk<BffSecretRotationAuditPort>()
         every { auditPort.recordUsage(any(), any(), any()) } throws RuntimeException("db down")
         // ... filter 호출 → 200 그대로
     }
     ```

  7. **회전 drill 문서화** (`docs/deploy/oci-backend.md`에 새 섹션 추가).
     ```markdown
     ### BFF secret 회전 drill

     1. 새 secret 생성: `openssl rand -base64 32`. 1Password에 저장.
     2. Cloudflare Pages env: `READMATES_BFF_SECRETS`에 두 번째 entry로 추가, 배포.
     3. OCI 인스턴스: `~/readmates/.env`의 `READMATES_BFF_SECRETS`에 동일 값을 추가.
        `docker compose up -d spring`로 재기동.
     4. audit table 분포 확인:
        ```sql
        SELECT secret_alias, COUNT(*)
        FROM bff_secret_rotation_audit
        WHERE used_at > NOW() - INTERVAL 1 HOUR
        GROUP BY secret_alias;
        ```
        `primary`와 `secondary` 양쪽이 보이면 둘 다 정상 동작 중이다.
     5. `primary` count가 0이 되거나 `secondary` count가 충분히 누적되면 BFF env에서 순서를
        `READMATES_BFF_SECRETS=<new>,<old>`로 swap.
     6. 추가 monitoring window (>= 1시간) 후 양쪽 env에서 old secret entry 제거.

     **retention**: `bff_secret_rotation_audit` 테이블은 분기마다 archive/truncate 권장.
     ```

  8. **boundary test 갱신 확인**. `ServerArchitectureBoundaryTest`가 신규 port/adapter 패키지를
     허용하는지 확인. `security.application.port.out`, `security.adapter.out.persistence` 명명을
     맞추면 기존 패턴과 충돌하지 않는다.

- **검증 방법**:
  - `./server/gradlew -p server test --tests 'com.readmates.security.filter.BffSecretFilter*'`
    모든 테스트 통과.
  - `./server/gradlew -p server test --tests 'com.readmates.architecture.*'` 통과.
  - V26 적용 후:
    ```sql
    SHOW CREATE TABLE bff_secret_rotation_audit;
    ```
    가 `bff_secret_rotation_audit_alias_used_at_idx` index를 포함.
  - staging 회전 drill 5단계 동안 다음 SQL의 분포가 단계에 따라 변화함을 확인.
    ```sql
    SELECT secret_alias, COUNT(*) FROM bff_secret_rotation_audit
    WHERE used_at > NOW() - INTERVAL 30 MINUTE
    GROUP BY secret_alias;
    ```
  - audit insert 실패 (예: DB 일시 단절)가 발생해도 BFF 응답이 영향받지 않음을 unit test로
    보증.

- **주의사항**:
  - audit insert는 절대 동기 처리 금지. request 응답까지의 latency가 늘어나면 안 된다.
  - audit log에 secret 평문은 절대 기록하지 않는다. `secret_alias` (`primary`/`secondary`/...)만
    기록.
  - `client_ip_hash`는 SPEC-R-002의 `ClientIpHashing.hashClientIp(...)` 결과만 사용. raw IP를
    저장하지 않는다.
  - `@Async` 사용 시 self-invocation 한정으로 동작하지 않는 점에 주의 (filter 자기 자신
    `@Async` 호출 무효). 별도 service bean을 통해 호출하거나 `CompletableFuture.runAsync`
    사용.
  - 본 task는 TASK-R-003a가 production에 배포된 후 한 번의 monitoring window를 거친 다음 진행해야
    한다. 즉 multi-secret이 실서비스에서 안정 동작함을 먼저 확인한다.

---

## 의존성 그래프

```
TASK-R-001 (legacy password 제거)
    └── (독립)

TASK-R-002 (IP hash base secret)
    └── (독립)
            └── 권장 선행 → TASK-R-003b (client_ip_hash 품질)

TASK-R-003a (multi-secret 지원)
    └── 필수 선행 → TASK-R-003b

TASK-R-003b (audit log + drill 문서)
    ├── 필수 선행: TASK-R-003a
    └── 권장 선행: TASK-R-002
```

릴리스 단위 권장 묶음:

- **release N**: TASK-R-001 + TASK-R-002 — 코드 변경(legacy 삭제) + 인프라 환경변수 추가.
- **release N+1**: TASK-R-003a — 서버 + BFF multi-secret refactor.
- **release N+2**: TASK-R-003b — V26 + audit + 회전 drill 문서.

## 체크리스트

### TASK-R-001: Legacy password 제거
- [ ] V24/V25 main 머지 상태 재확인.
- [ ] `PasswordResetController.kt` 삭제.
- [ ] `SecurityConfig.kt` 3 라인 제거 (csrf string / csrf regex / authorize permitAll).
- [ ] password 관련 dead test 정리.
- [ ] release notes 업데이트.
- [ ] `rg` 결과 0건 확인.
- [ ] staging 배포 → 두 endpoint 404 확인 → e2e 회원가입/로그인 통과.
- [ ] production 배포 후 SQL로 컬럼 부재 확인.

### TASK-R-002: IP hash base secret
- [ ] `openssl rand -base64 32`로 값 생성, 1Password 저장.
- [ ] OCI `.env`에 `READMATES_IP_HASH_BASE_SECRET` 추가.
- [ ] `compose.yml`에서 환경변수 전달 경로 확인.
- [ ] container restart, log 확인.
- [ ] `docs/deploy/oci-backend.md`에 운영 노트 추가.
- [ ] (선택) Spring 측 startup WARN 추가.
- [ ] `printenv` 검증.
- [ ] `ClientIpHashingTest` 통과 확인.

### TASK-R-003a: BFF multi-secret 지원
- [ ] `application.yml`에 `readmates.security.bff.secrets` 추가.
- [ ] `BffSecretFilter`를 multi-secret 시그니처로 리팩터, `aliasFor` helper 추가.
- [ ] 기존 3개 BffSecretFilter 테스트 갱신.
- [ ] 새 케이스 (각 secret 200, 임의 401, required+empty 시 startup 실패, legacy 단일값 호환)
      추가.
- [ ] `proxy.ts`의 `bffSecretFromEnv` multi-secret 지원.
- [ ] `[[path]].ts`의 `Env` 타입 갱신.
- [ ] `forwardedOAuthRequestHeaders` 등 다른 helper도 `bffSecretFromEnv` 사용으로 통일.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` 통과.
- [ ] staging 5단계 회전 drill에서 401 0건.
- [ ] production 배포 후 legacy `READMATES_BFF_SECRET` only 환경에서도 정상 동작 확인.

### TASK-R-003b: BFF rotation audit log
- [ ] V26 migration 작성.
- [ ] `BffSecretRotationAuditPort` 인터페이스 추가.
- [ ] `JdbcBffSecretRotationAuditAdapter` 구현.
- [ ] `@EnableAsync` 활성화 확인.
- [ ] `BffSecretFilter`에 audit port + 비동기 호출 통합.
- [ ] `BffSecretFilterAuditTest` 추가 (성공 케이스 + audit 실패 격리).
- [ ] architecture boundary test 통과.
- [ ] V26 적용 후 index 존재 SQL 검증.
- [ ] staging 회전 drill 동안 audit 분포 SQL 단계별 변화 확인.
- [ ] `docs/deploy/oci-backend.md`에 회전 drill 절차 + retention 노트 추가.
- [ ] production 배포 후 24시간 이상 audit row 누적 확인.
