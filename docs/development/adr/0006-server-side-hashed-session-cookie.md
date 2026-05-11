# ADR-0006: 서버 측 hashed session cookie (raw token 미저장)

- 상태: Accepted
- 결정일: 2026-04-21
- 작성자: 보안/서버
- 관련: ADR-0001 (BFF), ADR-0005 (BFF secret rotation),
  `server/src/main/kotlin/com/readmates/auth/application/service/AuthSessionService.kt`,
  `server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcAuthSessionAdapter.kt`,
  `server/src/main/resources/db/mysql/migration/V1__readmates_mysql_baseline.sql`,
  `server/src/main/resources/db/mysql/migration/V25__drop_legacy_password_hash.sql`,
  `docs/development/architecture.md`

## 컨텍스트

ReadMates는 Google OAuth를 통해 사용자를 인증한다. Google OAuth 인증 성공 후 서버는 사용자를 식별할 수 있는 크리덴셜을 브라우저에 전달해야 한다. 이 크리덴셜의 형태를 결정해야 했다.

### 서비스 특성

ReadMates는 invite-only 멤버십 서비스다. 멤버십 상태가 실시간으로 변경될 수 있다:
- 호스트가 멤버를 `SUSPENDED`로 변경하면 즉시 접근이 차단되어야 한다.
- 멤버십이 취소되면 기존 세션이 즉시 무효화되어야 한다.
- 초대가 만료되면 보류 중인 세션이 처리되어야 한다.

이 특성이 "즉시 revoke 가능"한 세션 관리 방식을 요구한다.

### 검토한 세션 관리 방식

**방식 1: JWT (JSON Web Token)**

서버가 자체 서명한 JWT를 브라우저에 전달. 서버가 세션 상태를 저장하지 않는다 (stateless).

문제:
- 즉시 revoke 불가. 발급된 JWT는 만료 시간까지 유효하다.
- 멤버십 취소, 계정 차단이 발생해도 JWT 만료까지 세션이 유효하다.
- Blocklist를 운영하면 stateless의 장점을 잃는다. DB 조회가 필요해진다.
- 짧은 TTL + refresh token rotation은 운영 복잡도를 높인다.

**방식 2: OAuth raw token을 cookie로 저장**

Google access_token 또는 refresh_token을 `HttpOnly` cookie로 직접 발급.

문제:
- Google access_token이 DB에 평문으로 존재하면 DB 침해 시 Google API 접근 권한이 유출된다.
- access_token 만료 후 refresh 처리가 복잡하다.
- Google 쪽 token revoke와 서비스 세션 관리가 결합된다. Google이 token을 revoke하면 서비스 세션도 즉시 끊긴다 (의도하지 않은 결합).

**방식 3: 서버 측 세션 + token hash 저장**

임의 랜덤 토큰을 cookie로 발급하고, 서버 DB에는 SHA-256 hash만 저장.

장점:
- 단일 row 삭제로 즉시 세션 무효화 가능
- raw token이 DB에 없어 DB 침해 시 토큰 역산 불가
- Google OAuth와 서비스 세션이 분리됨

**비밀번호 로그인 제외 결정**

invite-only 서비스에서 비밀번호 관리 부담(bcrypt parameter tuning, reset email 처리, breach detection)이 불필요하다. 초기 scaffold에 남아 있던 `password_hash` column이 `V24__legacy_password_hash_rename.sql`(rename) + `V25__drop_legacy_password_hash.sql`(drop)으로 명시적으로 제거됐다.

## 결정

Google OAuth 인증 성공 후 Spring이 `readmates_session` 쿠키를 발급한다:

**Cookie 속성**:
- 이름: `readmates_session` (`AuthSessionService.kt:193`)
- `HttpOnly` 설정: JavaScript에서 접근 불가 (`AuthSessionService.kt:187`)
- `SameSite=Lax` 설정: cross-site 요청에서 자동 전송 차단 (`AuthSessionService.kt:188`)
- `Secure` 설정: production 환경에서만 (`AuthSessionService.kt:185`)
- TTL: 14일 (`AuthSessionService.kt:195` — `SESSION_TTL: Duration.ofDays(14)`)
- `JSESSIONID` cookie 동시 삭제: Spring의 기본 servlet session cookie가 발급되지 않도록 `buildCookie(SERVLET_SESSION_COOKIE_NAME, "", Duration.ZERO, ...)` 처리 (`AuthSessionService.kt:113`)

**토큰 생성**:
- `SecureRandom`으로 랜덤 토큰 생성 (`AuthSessionService.kt:37`)
- 브라우저에는 raw token을 cookie로 전달

**서버 저장**:
- DB `auth_sessions` 테이블에 raw token이 아닌 SHA-256 hash를 저장 (`AuthSessionService.kt:115-116`)
  ```kotlin
  fun hashToken(rawToken: String): String {
      val digest = MessageDigest.getInstance("SHA-256")
          .digest(rawToken.toByteArray(Charsets.UTF_8))
      // ...
  }
  ```
- `JdbcAuthSessionAdapter.kt:20`이 `auth_sessions` INSERT를 처리한다

**검증**:
- 요청에서 `readmates_session` cookie를 읽어 SHA-256 hash를 계산
- DB에서 해당 hash로 `auth_sessions` row를 조회
- `expires_at`, 멤버십 상태를 확인해 접근 허용/거부 결정

**raw OAuth token 미저장**:
- Google access_token, refresh_token, id_token은 서버 DB에도, 브라우저에도 저장하지 않는다
- Google로부터 받은 정보는 멤버 계정 식별에만 사용되고 버린다

## 근거

### 즉시 revoke 가능

JWT와 달리 서버 측 세션은 `auth_sessions` 테이블의 single row를 삭제/`is_revoked=true`로 갱신하면 즉시 무효화된다. 멤버십이 취소되거나 계정이 차단되면:
1. `auth_sessions`에서 해당 멤버의 row를 revoke
2. 다음 API 요청에서 hash 조회 시 row를 찾을 수 없거나 revoked 상태 → 401 반환
3. 사용자는 즉시 로그인 페이지로 redirect

JWT라면 토큰 만료까지 해당 사용자가 서비스를 계속 사용할 수 있다.

특히 ReadMates의 invite-only 특성상 "멤버를 즉시 차단"이 호스트의 핵심 관리 기능이다. 멤버 상태가 `SUSPENDED`로 변경되는 순간 해당 멤버의 세션이 즉시 무효화되어야 한다. JWT 방식에서 이를 구현하려면 blocklist가 필요하고, blocklist를 유지하면 JWT의 stateless 장점이 사라진다.

### IP 기반 session tracking (선택적)

세션 발급 시 클라이언트 IP를 SHA-256 해시 형태로 `auth_sessions.ip_hash`에 저장한다(`AuthSessionService.kt:54`). raw IP가 아닌 hash를 저장해 개인정보 노출 없이 suspicious session 탐지가 가능하다. 같은 세션이 다른 IP hash에서 접근하면 잠재적 session hijack 지표가 된다.

### Raw token 노출 없음

Google access_token은 Google API에 직접 요청을 보낼 수 있다. 이 값이 DB에 평문으로 저장되면:
- DB 침해 시 Google API 접근 권한이 유출된다
- 공격자가 Google 데이터에 접근할 수 있다

`readmates_session` 쿠키 값(랜덤 토큰)이 SHA-256 해시로만 DB에 저장된다. DB가 침해되어도 쿠키 값을 역산할 수 없다. 쿠키 값 자체는 Google API와 무관한 ReadMates-specific 랜덤 토큰이다.

### XSS 방어: HttpOnly

`HttpOnly` 속성으로 브라우저 JavaScript가 `readmates_session` 쿠키에 접근할 수 없다. XSS 공격으로 스크립트가 주입되어도 세션 쿠키를 탈취할 수 없다. Cookie값은 HTTP 요청에만 자동으로 포함된다.

### CSRF 방어: SameSite=Lax

`SameSite=Lax`는 top-level navigation이 아닌 cross-site 요청에서 쿠키가 자동으로 전송되지 않는다. 악성 사이트에서 ReadMates API를 직접 호출해도 세션 쿠키가 포함되지 않는다. 별도 CSRF token 없이도 state-changing mutation이 다른 origin에서 발생하지 않는다. (BFF의 `X-Readmates-Bff-Secret` + Origin/Referer 검증과 함께 이중 방어)

### BFF와의 통합

BFF(ADR-0001)는 Spring이 발급한 `Set-Cookie`의 `domain=` 속성을 제거해 BFF origin에 맞는 쿠키로 재발급한다. 브라우저는 Spring API origin을 알지 못하고, `readmates_session` 쿠키가 BFF origin에 바인딩된다.

### TTL 관리 단순성

세션 만료는 `auth_sessions.expires_at` 컬럼으로 관리된다. JWT access token/refresh token rotation 운영 복잡도가 없다:
- 만료된 세션: DB에서 `expires_at < now()` row 정리 (cleanup job으로 처리)
- 활성 세션 TTL 연장: `expires_at` 갱신

## 대안

| 대안 | 기각 이유 |
|------|----------|
| JWT (stateless, 서버가 서명) | 즉시 revoke 불가. invite-only 서비스에서 멤버십 변경이 즉시 반영되지 않으면 안된다. Blocklist 운영은 stateless의 장점을 포기한다. 짧은 TTL + refresh rotation은 운영 복잡도를 높인다. |
| Google access_token을 HttpOnly cookie로 직접 저장 | DB에 raw OAuth token 저장은 DB 침해 시 Google API 접근 권한 유출 위험. Google token revoke와 서비스 세션이 결합되어 의도치 않은 로그아웃 발생 가능. token refresh 처리 복잡도. |
| Spring Session + Redis (처음부터 도입) | Redis 없이도 서버 측 세션이 구현 가능하다. 초기 설계에서 MySQL만으로 충분했다. Redis는 ADR-0012 후보로 선택적 도입 검토 중. |
| 비밀번호 + OAuth 복합 로그인 | invite-only 서비스에서 비밀번호 관리 부담이 불필요하다. bcrypt parameter tuning, 비밀번호 재설정 이메일, breach detection이 모두 추가 운영 부담이다. `V25__drop_legacy_password_hash.sql`에서 명시적으로 제거됐다. |
| Passkey (WebAuthn) | Google OAuth보다 사용자 경험이 더 좋을 수 있으나 디바이스/브라우저 지원, platform authenticator 구현이 복잡하다. 현재 invite-only 규모에서는 Google OAuth로 충분하다. |

## 결과

긍정적:
- 멤버십 변경, 계정 차단 시 단일 row 처리로 즉시 세션 무효화가 가능하다.
- raw OAuth token이 서버 DB에 저장되지 않으므로 DB 침해 시 OAuth token leak 위험이 없다.
- `HttpOnly + SameSite=Lax` cookie posture로 XSS/CSRF 공격 표면이 축소된다.
- JWT refresh token rotation 운영 부담이 없다.
- 멤버십 상태, 접근 권한 변경이 다음 요청에서 즉시 반영된다.
- 비밀번호 관리 인프라(reset email, bcrypt, breach detection)가 불필요하다.

부정적/감수한 비용:
- Stateful이다. 모든 인증 요청이 DB `auth_sessions` 조회를 포함한다. 현재 트래픽 수준에서는 문제가 없으나, 트래픽이 크게 늘면 세션 조회가 병목이 될 수 있다.
- `auth_sessions` 테이블이 커지면 만료 세션 cleanup job이 필요하다.
- Redis 캐시 없이 세션 조회가 항상 MySQL로 간다. ADR-0012(Redis 정식 도입) 후보로 세션 캐시 도입 검토 예정.
- Google OAuth provider에 의존한다. Google OAuth 인프라 장애 시 신규 로그인 불가. 이미 발급된 세션은 영향 없다.
- 14일 절대 TTL 정책이 고정되어 있다. 자주 사용하는 사용자도 14일마다 재로그인해야 한다. 이 정책이 UX와 보안 사이의 trade-off를 명시적으로 결정한 것인지, 초기 기본값인지 명확히 할 필요가 있다.
- `readmates_session` 쿠키 이름이 코드에 상수(`COOKIE_NAME = "readmates_session"`)로 하드코딩되어 있다. 이름 변경 시 기존 세션이 모두 무효화된다는 점을 배포 전에 인지해야 한다.
- BFF와 Spring 간 쿠키 흐름 E2E 검증: `stripCookieDomain` 처리 후 브라우저에 설정된 쿠키의 domain 속성이 없는지, `readmates_session` 쿠키가 BFF origin에 올바르게 바인딩되는지를 Playwright E2E 테스트로 검증하는 케이스 추가.
- 세션 도용 탐지 로직 강화: `ip_hash`를 세션 발급 시와 요청 시 비교해 완전히 다른 IP에서 같은 세션이 접근하면 경고 또는 강제 만료 정책 결정. `READMATES_IP_HASH_BASE_SECRET` 환경 변수가 이를 위해 존재하지만 현재 탐지 로직이 없다.

## 검증

세션 인증 테스트:
```bash
./server/gradlew -p server test --tests "*Session*"
./server/gradlew -p server test --tests "*Auth*"
```

세션 발급/검증 흐름 확인:
1. Google OAuth callback → `AuthSessionService.createSession` → `auth_sessions` 테이블에 hash 저장
2. 이후 API 요청 → `readmates_session` cookie → `hashToken` → DB 조회 → `expires_at` 확인

즉시 revoke 검증:
- `auth_sessions` row 삭제 후 동일 cookie로 API 요청 → 401 반환 확인

Raw token 미저장 검증:
- `auth_sessions` 테이블 schema에 raw token 컬럼이 없음 (`V1__readmates_mysql_baseline.sql` 참조)
- `V25__drop_legacy_password_hash.sql` — legacy password column이 제거됐음 확인

## 후속 작업

- Redis 기반 세션 캐시: `auth_sessions` 조회를 Redis에 먼저 시도하고 cache miss 시 MySQL fallback. ADR-0012 후보.
- 세션 TTL sliding extension: 활성 사용자의 세션 TTL을 자동으로 연장하는 정책 결정.
- Multi-device session 관리 UI: 사용자가 자신의 세션 목록을 보고 개별 세션을 revoke할 수 있는 기능.
- 만료 세션 cleanup job: `auth_sessions`에서 `expires_at < now()`인 row를 정기적으로 삭제.
- IP hash 기반 suspicious session 탐지: 같은 세션이 완전히 다른 IP에서 접근하면 경고.
- 세션 `is_revoked` 컬럼 vs row 삭제 선택 재검토: 현재 revoke는 row 삭제로 구현된다. `is_revoked=true` 방식은 revoke 이력이 보존되지만 테이블이 커진다. 현재 구현이 의도인지 명시적으로 문서화 필요.
- `auth_sessions` index 최적화: `session_token_hash` column에 index가 있는지, `expires_at` 조회에 최적 index가 있는지 확인. 만료 세션 cleanup job이 추가되면 `expires_at` index가 중요해진다.
- Google OAuth scope 검토: 현재 인증에서 Google로부터 받는 scope(이름, 이메일, profile picture)가 명시되어야 한다. scope가 최소화(least privilege)되어야 하며, 불필요한 scope 요청은 사용자 신뢰를 낮춘다.
- Cookie `__Host-` prefix 도입 검토: `__Host-readmates_session`은 path=/, Secure만 허용하고, domain 속성을 가질 수 없다. 더 강한 same-site 보장을 제공한다. BFF의 `stripCookieDomain` 처리와의 호환성 검증 필요.
- 세션 renewal 정책 명문화: 현재 14일 TTL이 고정이다. 마지막 활동 기준 sliding window 방식(활동 시 TTL 연장) 또는 absolute TTL 방식 중 서비스 정책에 맞는 방식 결정 필요.
- `JSESSIONID` cookie 완전 비활성화 검증: Spring Boot의 `server.servlet.session.tracking-modes=cookie` 설정을 `none`으로 변경해 기본 servlet session cookie가 아예 발급되지 않도록 설정 검토. 현재는 발급 후 즉시 삭제로 처리하고 있다.
